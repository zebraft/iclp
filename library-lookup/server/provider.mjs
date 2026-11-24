import { UserError, normalizeISBN } from './contracts.mjs';
import {sitesConfigured} from './sites-provider.mjs';
import {cachedToken,invalidateToken} from './lookup-cache.mjs';
import {upstreamOffset,uniqueRecords} from './pagination.mjs';
const API = 'https://americas.discovery.api.oclc.org/worldcat/search/v2/';
const TOKEN_URL = 'https://oauth.oclc.org/token';
export const now = () => new Date().toISOString();
const deny = (code,message) => { throw new UserError(code,message); };
function query(input) {
  const kind=input.kind||'title';
  if(kind==='issn'&&!/^\d{4}-?\d{3}[\dXx]$/.test(input.query.trim()))deny('invalid_input','ISSN must contain eight digits/check characters.');
  const text = kind==='isbn' ? normalizeISBN(input.query) : input.query.trim().replace(/["\\\r\n]/g,' ');
  if (kind==='oclc' && !/^\d{1,20}$/.test(text)) deny('invalid_input','OCLC number must contain 1–20 digits.');
  return `${({title:'ti',author:'au',keyword:'kw',isbn:'bn',issn:'in',oclc:'no'})[kind]}:"${text}"`;
}
export function status(env) {
  const mode=env.LIBRARY_MODE || (sitesConfigured(env)?'sites-bridge':'unconfigured');
  return { version:'0.2.0', mode, sample:mode==='sample', libraryName:env.LIBRARY_NAME||null, symbol:env.LIBRARY_SYMBOL||(mode==='sites-bridge'?'DEMO':null),
    configured: mode==='sample'||(mode==='sites-bridge'&&sitesConfigured(env))||(mode==='oclc'&&!!env.OCLC_CLIENT_ID&&!!env.OCLC_CLIENT_SECRET&&!!env.LIBRARY_SYMBOL),
    publicAuthorizationDeclared: env.LIBRARY_PUBLIC_AUTHORIZED==='true', limits:{booksPerCheck:3,booksPerList:30,searchPageSize:10,maxOffset:200,maxProviderCallsPerTool:8},
    scope:'Configured library by default; WorldCat-wide discovery on explicit request, for all catalogued material types. Article indexing and journal issue coverage may be incomplete; catalogue holdings do not prove full-text access. No patron or purchasing access.' };
}
function checkedConfig(env) {
  if(!status(env).configured) deny('not_configured','Live library connection is not configured. Ask the service maintainer; do not paste credentials into chat. / 館藏連線尚未設定');
  if(env.LIBRARY_MODE!=='oclc' || !/^[A-Z0-9]{2,12}$/.test(env.LIBRARY_SYMBOL)) deny('not_configured','Invalid library provider configuration.');
  if(env.RELEASE_CHANNEL==='public' && env.LIBRARY_PUBLIC_AUTHORIZED!=='true') deny('authorization_pending','Public provider use has not been authorized for this deployment.');
}
function link(env,id) {
  let origin=env.LIBRARY_CATALOG_ORIGIN||'https://www.worldcat.org';
  try { const u=new URL(origin); if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash) throw Error(); origin=u.origin; }
  catch { deny('not_configured','Catalog origin must be an HTTPS origin without path or credentials.'); }
  return origin+'/oclc/'+encodeURIComponent(id);
}
function bib(b,env) {
  const id=String(b.oclcNumber||'');
  if(!/^\d{1,20}$/.test(id)||typeof b.title!=='string') deny('provider_response','The catalogue returned an invalid record.');
  const str=(v,max=1000)=>typeof v==='string'?v.slice(0,max):'';
  return {oclcNumber:id,title:str(b.title),author:str(b.creator),year:str(b.date,40),publisher:str(b.publisher),format:str(b.specificFormat,100),edition:str(b.edition),isbns:Array.isArray(b.isbns)?b.isbns.filter(x=>typeof x==='string').slice(0,30):[],catalogUrl:link(env,id)};
}
async function boundedJSON(response) {
  if(!response.body) deny('provider_response','The catalogue returned an empty response.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();deny('provider_response','The catalogue response exceeded the safe size limit.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{deny('provider_response','The catalogue returned unreadable data.');}
}
export function createProvider(env, fetcher=fetch) {
  checkedConfig(env);let calls=0;const deadline=Date.now()+35000;
  const request=async(url,options)=>{
    if(++calls>8||Date.now()>=deadline) deny('budget_exceeded','This check reached its provider-call or time limit. Narrow the request.');
    try{return await fetcher(url,{...options,redirect:'manual',signal:AbortSignal.timeout(Math.min(12000,Math.max(1,deadline-Date.now())))});}catch{deny('provider_unavailable','The library provider could not be reached. Retry later. / 館藏服務暫時無法連線');}
  };
  const scopeFor=detail=>detail?'wcapi:view_holdings':'wcapi:view_brief_bib wcapi:view_institution_holdings';
  const auth=detail=>cachedToken(env,fetcher,scopeFor(detail),async()=>{
    const r=await request(TOKEN_URL,{method:'POST',headers:{Authorization:'Basic '+btoa(env.OCLC_CLIENT_ID+':'+env.OCLC_CLIENT_SECRET),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'client_credentials',scope:scopeFor(detail)})});
    if(r.status!==200)deny('provider_auth','The library provider rejected the service credential or scope. Ask the maintainer.');
    const d=await boundedJSON(r);if(typeof d.access_token!=='string'||!d.access_token)deny('provider_auth','The provider did not issue a usable access token.');
    return {token:d.access_token,expiresIn:d.expires_in};
  });
  const get=async(path,params,detail=false)=>{
    const r=await request(API+path+'?'+new URLSearchParams(params),{headers:{Authorization:'Bearer '+await auth(detail),Accept:'application/json'}});
    if(r.status===401||r.status===403){await invalidateToken(env,fetcher,scopeFor(detail));deny('permission_denied','The service credential cannot read this catalogue field. / 無此館藏讀取權限');}
    if(r.status===429) deny('provider_quota','The library provider quota is temporarily exhausted. Retry later.');
    if(r.status!==200) deny('provider_unavailable','The library provider did not complete the query. Retry later.');
    return boundedJSON(r);
  };
  return {
    async search(input) {
      const scope=input.scope||'library',offset=input.offset||0;
      const params={q:query(input),limit:'10',offset:String(upstreamOffset(offset)),groupRelatedEditions:'false',groupVariantRecords:'false',enableSearchExpansion:'false'};
      if(scope==='library')params.heldBySymbol=env.LIBRARY_SYMBOL;
      const d=await get('brief-bibs',params);
      if(!Number.isInteger(d?.numberOfRecords)||d.numberOfRecords<0||!Array.isArray(d.briefRecords??(d.numberOfRecords===0?[]:null)))deny('provider_response','The catalogue returned an invalid search page.');
      const rows=d.briefRecords||[];
      if(rows.length>10||offset+rows.length>d.numberOfRecords||(offset<d.numberOfRecords&&!rows.length))deny('provider_response','The catalogue returned an inconsistent search page.');
      const records=uniqueRecords(rows.map(b=>bib(b,env)));
      return {checkedAt:now(),scope,symbol:scope==='library'?env.LIBRARY_SYMBOL:null,libraryName:env.LIBRARY_NAME||env.LIBRARY_SYMBOL,query:input.query,total:d.numberOfRecords,offset,records,nextOffset:rows.length&&offset+rows.length<d.numberOfRecords&&offset+rows.length<=200?offset+rows.length:null,truncated:offset+rows.length<d.numberOfRecords,coverageComplete:false,sample:false};
    },
    async locations(id) {
      let d;
      try {d=await get('bibs-detailed-holdings',{oclcNumber:id,heldBySymbol:env.LIBRARY_SYMBOL},true);}
      catch(e) { if(['permission_denied','provider_auth'].includes(e.code))return {oclcNumber:id,checkedAt:now(),detailSupported:false,status:'unable_to_verify',message:e.message,catalogUrl:link(env,id),sample:false};throw e; }
      const containers=Array.isArray(d?.briefRecords)?d.briefRecords.map(b=>b.institutionHolding).filter(Boolean):[];
      if(Array.isArray(d?.detailedHoldings)) containers.push(d);
      if(!containers.length&&d?.numberOfRecords!==0)deny('provider_response','No detailed-holdings container was returned.');
      if(containers.some(c=>!Array.isArray(c.detailedHoldings)))deny('provider_response','The detailed holdings response is incomplete.');
      const all=containers.flatMap(c=>c.detailedHoldings).filter(h=>!h.oclcNumber||String(h.oclcNumber)===id);
      const text=v=>typeof v==='string'?v.slice(0,2000):'';
      // Explicit allowlist: never spread provider objects into a model-visible result.
      const holdings=all.slice(0,100).map(h=>({branchCode:text(h.location?.holdingLocation),collection:text(h.location?.sublocationCollection),shelvingLocation:text(h.location?.shelvingLocation),callNumber:text(h.callNumber?.displayCallNumber),summary:text(h.summary),statements:(h.holdingParts||[]).slice(0,20).map(p=>({summary:text(p.summaryOfHoldings),text:text(p.textualHoldings)}))}));
      return {oclcNumber:id,checkedAt:now(),symbol:env.LIBRARY_SYMBOL,detailSupported:true,holdings,truncated:all.length>100,coverageComplete:false,catalogUrl:link(env,id),sample:false};
    }
  };
}
