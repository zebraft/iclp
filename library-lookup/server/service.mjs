import { tools, validate, normalizeBooks, normalizeISBN, UserError } from './contracts.mjs';
import { createProvider, status } from './provider.mjs';
import { sampleProvider } from './sample.mjs';
import {assessSerialCoverage} from './serial-coverage.mjs';
import {createSitesProvider} from './sites-provider.mjs';
const cleanBook = b => Object.fromEntries(Object.entries(b).filter(([k])=>['id','title','author','isbn','oclcNumber','year','publisher','edition','format','volume','rationale'].includes(k)));
export const safeError = error => ({code:error instanceof UserError?error.code:'internal_error',message:error instanceof UserError?error.message:'The library request failed. Retry later or contact the service maintainer. / 查詢失敗，請稍後重試',retryable:['provider_unavailable','provider_quota','internal_error'].includes(error?.code)});
export function csvExport(books,ids) {
 const set=new Set(ids);if(ids.some(id=>!books.some(b=>b.id===id)))throw new UserError('invalid_selection','Selected ID is absent from this book list.');
 // Neutralize spreadsheet formulas, including leading whitespace and control characters.
 const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const keys=['id','title','author','isbn','oclcNumber','year','publisher','edition','format','volume','rationale'];
 const selected=books.filter(b=>set.has(b.id));
 return {filename:'selected-books.csv',mimeType:'text/csv;charset=utf-8',selectedIds:selected.map(b=>b.id),count:selected.length,csv:'\uFEFF'+[keys,...selected.map(b=>keys.map(k=>b[k]||''))].map(row=>row.map(cell).join(',')).join('\r\n'),persisted:false,sent:false};
}
export async function invoke(name,args,env={},fetcher=fetch,req=null) {
 const tool=tools.find(t=>t.name===name);if(!tool)throw new UserError('unsupported_tool','This plugin does not support that operation.');
 validate(args,tool.inputSchema);
 if(args.scope==='as')args={...args,scope:'library'};
 if(name==='library_status')return status(env);
 if(name==='prepare_book_list')return {books:normalizeBooks(args.books),holdingsChecked:false,persisted:false};
 if(name==='export_selection')return csvExport(normalizeBooks(args.books),args.selectedIds);
 const mode=status(env).mode;
 const provider=mode==='sample'?sampleProvider():mode==='sites-bridge'?createSitesProvider(env,fetcher,req):createProvider(env,fetcher);
 if(name==='search_articles'){
  const scope=args.scope||'library';
  const articleSearch=await provider.search({query:args.query,kind:args.kind||'title',scope,offset:args.offset||0});
  let hostJournalSearch=null,hostJournalError=null;
  if(args.issn||args.journalTitle){
   try{hostJournalSearch=await provider.search({query:args.issn||args.journalTitle,kind:args.issn?'issn':'title',scope,offset:0});}
   catch(e){hostJournalError=safeError(e);}
  }
  return {scope,articleSearch,hostJournalSearch,hostJournalError,articleIdentityVerified:false,issueCoverageVerified:false,fullTextAccessVerified:false,coverageComplete:false,
   message:'Catalogue candidates only; records may describe articles, journals or other materials. Verify the article citation and host journal separately. Journal holdings alone do not establish access to a particular article or issue. No results do not establish absence from article indexes.'};
 }
 if(name==='search_library_catalog')return provider.search(args);
 if(name==='get_library_locations'){
  const result=await provider.locations(args.oclcNumber);
  return args.citationYear?{...result,serialCoverage:assessSerialCoverage(result.holdings||[],args.citationYear)}:result;
 }
 const books=normalizeBooks(args.books),results=[];
 for(const b of books) {
  const q=b.oclcNumber||b.isbn||b.title,kind=b.oclcNumber?'oclc':b.isbn?'isbn':'title';
  try {
   const page=await provider.search({query:q,kind,scope:'library',offset:0});
   const isbnMatches=r=>!!b.isbn&&r.isbns.some(isbn=>{try{return normalizeISBN(isbn)===b.isbn;}catch{return false;}});
   const matching=page.records.filter(r=>(b.oclcNumber||b.isbn)&&(!b.oclcNumber||r.oclcNumber===b.oclcNumber)&&(!b.isbn||isbnMatches(r)));
   const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
   const identityWarnings=page.records.flatMap(r=>[
    ...(b.isbn&&!isbnMatches(r)?[{oclcNumber:r.oclcNumber,reason:'supplied_isbn_not_confirmed_in_record'}]:[]),
    ...(normalize(b.title)!==normalize(r.title)?[{oclcNumber:r.oclcNumber,reason:'title_differs_requires_review'}]:[]),
    ...['edition','format','year'].filter(k=>b[k]&&(!r[k]||normalize(b[k])!==normalize(r[k]))).map(field=>({oclcNumber:r.oclcNumber,reason:field+'_differs_or_not_confirmed',supplied:b[field],returned:r[field]||null})),
    ...(b.volume?[{oclcNumber:r.oclcNumber,reason:'volume_requires_holdings_review',supplied:b.volume}]:[])
   ]);
   const outcome=matching.length?'holding_found_identity_review':page.records.length?'candidate_requires_review':page.truncated?'unable_to_verify':'no_holding_found_in_bounded_search';
   results.push({book:cleanBook(b),outcome,checkedAt:page.checkedAt,symbol:page.symbol,sample:page.sample,query:{kind,value:q},records:page.records,identityWarnings,truncated:page.truncated,coverageComplete:false,identityVerified:false,message:outcome==='holding_found_identity_review'?'A symbol-filtered record matches the supplied identifier. Review title, edition, volume, format and branch before excluding or recommending.':outcome==='no_holding_found_in_bounded_search'?'No holding found in this bounded query. Other editions, unindexed records and other branches may differ.':'Candidate identity or provider coverage requires review.'});
  } catch(e) {
   const error=safeError(e);results.push({book:cleanBook(b),outcome:'unable_to_verify',error,records:[],coverageComplete:false,identityVerified:false,sample:env.LIBRARY_MODE==='sample'});
  }
 }
 return {results,books:books.map(cleanBook),sample:env.LIBRARY_MODE==='sample',purchaseReady:false,persisted:false};
}
