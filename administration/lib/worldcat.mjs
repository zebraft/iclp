export const API='https://americas.discovery.api.oclc.org/worldcat/search/v2/';
export function compact(b) {return {oclcNumber:String(b.oclcNumber||''),title:b.title,creator:b.creator,year:b.date,edition:b.edition,publisher:b.publisher,format:b.specificFormat,isbns:Array.isArray(b.isbns)?b.isbns.map(String):[],holdings:b.institutionHolding||null};}
export function parsePage(r,requireTotal=true) {
 const d=r?.data;
 if(r?.http!==200) return {ok:false,rows:[],error:r?.error||'api_error'};
 if(!d||typeof d!=='object'||Array.isArray(d))return {ok:false,rows:[],error:'invalid_body'};
 const present=Object.hasOwn(d,'numberOfRecords');
 if((requireTotal&&!present)||(present&&(!Number.isInteger(d.numberOfRecords)||d.numberOfRecords<0)))return {ok:false,rows:[],error:'invalid_total'};
 const total=present?d.numberOfRecords:null;
 const rows=Array.isArray(d.briefRecords)?d.briefRecords:total===0&&!Object.hasOwn(d,'briefRecords')?[]:null;
 if(!rows||rows.some(b=>!b||typeof b!=='object'||!b.oclcNumber)||(total===0&&rows.length))return {ok:false,rows:[],error:'invalid_records'};
 return {ok:true,rows,total,recordsField:Object.hasOwn(d,'briefRecords')?'array':'omitted'};
}
export function titleVariants(title) {
 const original=String(title||'').trim();
 const clean=original.normalize('NFKC').replace(/^\[|\]$/g,'').replace(/^増補改訂版\s*/, '').replace(/\s*\([^)]*新書[^)]*\)\s*$/,'').replace(/\s+アジア遊学\s*\d+\s*$/,'').trim();
 const main=clean.split(/\s*[:：]\s*/)[0].trim();
 const words=main.split(/\s+/);
 const core=/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(main)&&words[0].length>=4?words[0]:words.length>6?words.slice(0,5).join(' '):main;
 return [...new Set([original,clean,main,core])].filter(t=>t.length>=4);
}
export async function authenticate(id,secret,fetcher=fetch) {
 let r;try{r=await fetcher('https://oauth.oclc.org/token',{method:'POST',redirect:'manual',headers:{Authorization:'Basic '+btoa(id+':'+secret),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'client_credentials',scope:'wcapi:view_brief_bib wcapi:view_institution_holdings'}),signal:AbortSignal.timeout(20000)});}catch{throw Error('OCLC 驗證連線失敗 / OCLC authentication transport failure');}
 if(r.status!==200)throw Error('OCLC 驗證失敗 / OCLC authentication failed: HTTP '+r.status);
 let data;try{data=await r.json();}catch{throw Error('OCLC 驗證回應異常 / Invalid authentication response');}
 if(!data.access_token)throw Error('OCLC 未回傳權杖 / OCLC token missing');
 return {token:data.access_token,scope:data.scope||data.scopes||null,expiresIn:Number(data.expires_in)||300};
}
export function transport(token,fetcher=fetch) {
 const started=Date.now();let requests=0;
 return async(path,params)=>{
  if(Date.now()-started>90000||requests++>=70)return {http:0,error:'request_budget'};
  try{const r=await fetcher(API+path+'?'+new URLSearchParams(params),{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});
   if(r.status!==200)return {http:r.status,error:'api_error'};
   return {http:200,data:await r.json()};
  }catch{return {http:0,error:'transport_or_json'};}
 };
}
export const STRATEGY_VERSION='isbn-first-v2';
const normalize=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const mainTitle=s=>titleVariants(s)[1]||titleVariants(s)[0]||String(s||'');
function similarity(a,b){
 a=normalize(a);b=normalize(b);if(!a||!b)return 0;if(a===b)return 1;
 const grams=s=>new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));
 const x=grams(a),y=grams(b);return [...x].filter(v=>y.has(v)).length/new Set([...x,...y]).size;
}
function titleScore(a,b){
 const variantsA=titleVariants(a),variantsB=titleVariants(b);
 const cjk=/\p{Script=Han}/u.test(String(a)+String(b));
 const characters=(a,b)=>{const x=new Set(normalize(a)),y=new Set(normalize(b));return [...x].filter(c=>y.has(c)).length/new Set([...x,...y]).size;};
 return Math.max(similarity(a,b),similarity(String(a).split(/[:：]/)[0],String(b).split(/[:：=]/)[0]),...variantsA.flatMap(t=>variantsB.map(v=>Math.max(similarity(t,v),cjk?characters(t,v):0))));
}
export function identity(input,record){
 const exactIsbn=!!input.isbn&&record.isbns?.includes(input.isbn);
 const score=titleScore(input.title,record.title||'');
 const volume=/\b(?:vol(?:ume)?\.?|part|band(?:e)?)\s*[\divxlcdm]+\b|第?\s*[一二三四五六七八九十\d]+\s*[卷冊集]/iu.test(input.title);
 const parent=/complete Chinese text|encyclopedia of materia|全集|全[冊巻卷]|全套/iu.test(record.title||'')||(record.isbns?.length||0)>8;
 const reasons=[];
 if(score<.72)reasons.push('title_identity_unverified');
 if(volume||parent)reasons.push('volume_or_parent_record_requires_review');
 // ISBN + full bibliographic title is required for automatic early stopping.
 // Same author/title with another ISBN remains review evidence, never a fast exclusion.
 return {exactIsbn,titleScore:score,relevant:exactIsbn||score>=.45,verified:exactIsbn&&score>=.85&&!volume&&!parent,reasons};
}
export async function checkBook(input,send){
 const started=Date.now();
 const report={input,checkedAt:new Date().toISOString(),symbol:'AAE',scopeProvisional:true,purchaseReady:false,searches:[],checks:[],incompleteReasons:[],ASholding:'uncertain',strategy:STRATEGY_VERSION,earlyStopped:false,identityReview:[],metrics:{searchRequests:0,holdingsRequests:0,elapsedMs:0}};
 const candidates=new Map(),queried=new Set(),checked=new Set();let verifiedPositive=false,exactSearchComplete=true;
 const issue=(stage,reason)=>report.incompleteReasons.push({stage,reason});
 const held=b=>b.holdings?.totalHoldingCount>0&&b.holdings?.briefHoldings?.some(h=>h.institutionNumber===11128);
 async function search(q,localOnly){
  const stage=(localOnly?'AAE:':'worldwide:')+q;if(queried.has(stage))return;queried.add(stage);
  let offset=0;
  for(let page=0;page<2;page++){
   const params={q,groupRelatedEditions:'false',groupVariantRecords:'false',enableSearchExpansion:'false',limit:'50',offset:String(offset)};if(localOnly)params.heldBySymbol='AAE';
   report.metrics.searchRequests++;
   const r=await send('brief-bibs',params),p=parsePage(r);
   report.searches.push({q,localOnly,offset,http:r.http,total:p.total,error:p.error||null,records:p.rows.map(compact)});
   if(!p.ok){issue(stage,p.error);if(q.startsWith('bn:'))exactSearchComplete=false;break;}
   if(offset+p.rows.length>p.total){issue(stage,'count_exceeds_total');break;}
   for(const b of p.rows){const id=String(b.oclcNumber);if(!candidates.has(id))candidates.set(id,{record:compact(b),via:[]});candidates.get(id).via.push(stage);}
   offset+=p.rows.length;if(offset>=p.total)break;
   if(!p.rows.length||page===1){issue(stage,'search_page_cap_or_gap');break;}
  }
 }
 async function inspect(){
  const relevant=[...candidates].filter(([id,c])=>!checked.has(id)&&identity(input,c.record).relevant).sort((a,b)=>Number(identity(input,b[1].record).exactIsbn)-Number(identity(input,a[1].record).exactIsbn)||titleScore(input.title,b[1].record.title)-titleScore(input.title,a[1].record.title));
  const remaining=Math.max(0,25-checked.size);
  if(relevant.length>remaining)issue('candidates','candidate_cap');
  for(const [id,c] of relevant.slice(0,remaining)){
   checked.add(id);const check={oclcNumber:id,candidate:c.record,via:c.via,records:[],pages:[]};let offset=0;
   for(let page=0;page<2;page++){
    report.metrics.holdingsRequests++;
    const r=await send('bibs-holdings',{oclcNumber:id,heldBySymbol:'AAE',holdingsAllEditions:'false',holdingsAllVariantRecords:'true',limit:'50',offset:String(offset)}),p=parsePage(r,false);
    check.pages.push({offset,http:r.http,total:p.total,error:p.error||null});
    if(!p.ok){issue(id,p.error);break;}
    check.records.push(...p.rows.map(compact));offset+=p.rows.length;
    if(p.total===null){if(p.rows.length>=50)issue(id,'missing_pagination_total');break;}
    if(offset>p.total){issue(id,'count_exceeds_total');break;}
    if(offset>=p.total)break;
    if(!p.rows.length||page===1){issue(id,'holdings_page_cap_or_gap');break;}
   }
   if(!check.records.some(b=>b.oclcNumber===id))issue(id,'requested_record_missing');
   for(const b of check.records){const h=b.holdings;if(!h||!Number.isInteger(h.totalHoldingCount)||h.totalHoldingCount<0)issue(id,'invalid_holding_count');else if(h.totalHoldingCount>0&&(!Array.isArray(h.briefHoldings)||!h.briefHoldings.length))issue(id,'institutions_missing');
    if(held(b)){const match=identity(input,b);report.identityReview.push({oclcNumber:b.oclcNumber,...match});if(match.verified&&b.format==='PrintBook')verifiedPositive=true;}
   }
   report.checks.push(check);
   if(verifiedPositive)return;
  }
 }
 // Query and inspect one stage at a time; a verified local positive needs no wider search.
 if(input.isbn){for(const local of [true,false]){await search('bn:'+input.isbn,local);await inspect();if(verifiedPositive)break;}}
 if(!verifiedPositive){
  const variants=titleVariants(input.title);const author=String(input.author||'').replace(/["\\]/g,' ').trim();
  const cleanedAuthor=author.split(/[，、；;]/)[0].replace(/(?:\(著\)|（著）|編著|编著|著|編|编|譯|译)$/u,'').trim();
  const surname=cleanedAuthor.includes(',')?cleanedAuthor.split(',')[0].trim():cleanedAuthor.split(/\s+/).at(-1);
  const selected=[variants[0],variants.find(v=>v!==variants[0])].filter(Boolean);
  for(const title of [...new Set(selected)]){
   // Never issue a bare short-title fallback such as "Chapter" or "Fixers".
   if(!surname&&title!==variants[0]&&title.split(/\s+/).length<3&&!/\p{Script=Han}/u.test(title))continue;
   const q='ti:"'+title.replace(/"/g,' ')+'"'+(surname?' AND au:"'+surname+'"':'');
   for(const local of [true,false]){await search(q,local);await inspect();if(verifiedPositive)break;}
   if(verifiedPositive)break;
  }
 }
 report.earlyStopped=verifiedPositive;
 const all=report.checks.flatMap(c=>c.records);
 report.matchingPrintHoldingOclcs=[...new Set(all.filter(b=>b.format==='PrintBook'&&identity(input,b).verified&&held(b)).map(b=>b.oclcNumber))];
 report.candidateCount=candidates.size;
 report.relevantCandidateCount=[...candidates.values()].filter(c=>identity(input,c.record).relevant).length;
 report.skippedUnrelatedCandidateCount=report.candidateCount-report.relevantCandidateCount;
 report.exactPrintCandidateCount=[...candidates.values()].filter(c=>c.record.format==='PrintBook'&&input.isbn&&c.record.isbns.includes(input.isbn)).length;
 report.incomplete=report.incompleteReasons.length>0;
 const anyRelevantHolding=all.some(b=>held(b)&&identity(input,b).titleScore>=.45);
 report.outcome=report.matchingPrintHoldingOclcs.length?'matching_print_holding_requires_scope_review':anyRelevantHolding?'holding_candidate_requires_identity_review':report.incomplete||!exactSearchComplete?'uncertain':[...candidates.values()].some(c=>c.record.format==='PrintBook'&&identity(input,c.record).exactIsbn&&identity(input,c.record).titleScore>=.45)?'no_holding_found_in_AAE':'uncertain';
 report.coverage=verifiedPositive?'targeted_positive_evidence_not_exhaustive':'bounded_ISBN_and_title_author_search';
 report.catalogLinks=[...checked].map(id=>({oclcNumber:id,url:'https://aslib.on.worldcat.org/oclc/'+id,visited:false}));
 report.bibliographicWarnings=[];
 if(input.isbn&&[...candidates.values()].some(c=>identity(input,c.record).exactIsbn)&&![...candidates.values()].some(c=>identity(input,c.record).exactIsbn&&identity(input,c.record).titleScore>=.45))report.bibliographicWarnings.push({reason:'isbn_resolves_to_different_title'});
 const sourceYear=String(input.sourceListDate||'').match(/20\d{2}/)?.[0];
 const years=[...new Set([...candidates.values()].map(c=>String(c.record.year||'').match(/(?:19|20)\d{2}/)?.[0]).filter(Boolean))];
 if(sourceYear&&years.some(y=>y!==sourceYear))report.bibliographicWarnings.push({reason:'source_date_differs_from_catalog_year',sourceListDate:input.sourceListDate,catalogYears:years});
 report.metrics.elapsedMs=Date.now()-started;
 return report;
}
