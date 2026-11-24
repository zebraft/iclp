import {UserError} from './contracts.mjs';
const fail=(code,message)=>{throw new UserError(code,message);};
export const sitesConfigured=env=>env.LIBRARY_READER_TRANSPORT==='test-gateway'?!!env.LIBRARY_TEST_GATEWAY_SECRET&&!!env.LIBRARY_TEST_GATEWAY_ORIGIN:!!env.LIBRARY_READER_SECRET&&!!env.LIBRARY_BACKEND_ACCESS&&!!env.LIBRARY_BACKEND_ORIGIN;
export async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function createSitesTransport(env,fetcher=fetch,req=null){
 if(!sitesConfigured(env))fail('not_configured','The Sites library bridge is not configured.');
 const gateway=env.LIBRARY_READER_TRANSPORT==='test-gateway';
 const secret=gateway?env.LIBRARY_TEST_GATEWAY_SECRET:env.LIBRARY_READER_SECRET;
 let origin;try{const u=new URL(gateway?env.LIBRARY_TEST_GATEWAY_ORIGIN:env.LIBRARY_BACKEND_ORIGIN);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!u.hostname.endsWith('.chatgpt.site'))throw Error();origin=u.origin;}catch{fail('not_configured','The library backend must be a configured Sites HTTPS origin.');}
 // This retained bridge has a fixed institution scope. It must not impersonate another library.
 if(env.LIBRARY_SYMBOL&&env.LIBRARY_SYMBOL!=='DEMO')fail('not_configured','The retained Sites bridge supports DEMO only.');
 if(env.RELEASE_CHANNEL==='public'&&env.LIBRARY_PUBLIC_AUTHORIZED!=='true')fail('authorization_pending','Public provider use has not been authorized for this deployment.');
 let calls=0;const deadline=Date.now()+35000;
 const send=async payload=>{
  if(++calls>3||Date.now()>=deadline)fail('budget_exceeded','The Sites lookup budget was reached.');
  const identity=req?.headers.get('oai-authenticated-user-id')||req?.headers.get('cf-connecting-ip')||'anonymous';
  payload.caller=await hmac(secret,'reader:'+identity);
  const body=JSON.stringify(payload),stamp=String(Date.now());let response;
  const headers={'Content-Type':'application/json','x-library-time':stamp,'x-library-signature':await hmac(secret,stamp+'\n'+body)};
  if(!gateway)headers['OAI-Sites-Authorization']='Bearer '+env.LIBRARY_BACKEND_ACCESS;
  try{response=await fetcher(origin+(gateway?'/api/library-test-reader':'/api/reader-service'),{method:'POST',redirect:'manual',headers,body,signal:AbortSignal.timeout(Math.min(12000,Math.max(1,deadline-Date.now())))});}catch{fail('provider_unavailable','The Sites library service could not be reached.');}
  if(response.status===429)fail('provider_quota','The shared library query quota is reached. Retry later.');
  if(response.status===401||response.status===403)fail('permission_denied','The library bridge access was denied. Ask the service maintainer.');
  if(!response.ok)fail('provider_unavailable','The library service did not complete the query.');
  if(!response.body)fail('provider_response','The library service returned an empty response.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();fail('provider_response','The library response exceeded the safe size limit.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('provider_response','The library service returned unreadable data.');}
 };
 return {send};
}
export function createSitesProvider(env,fetcher=fetch,req=null){
 const {send}=createSitesTransport(env,fetcher,req);
 const text=v=>typeof v==='string'?v.slice(0,2000):'';
 const safeURL=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 return {
  async search(input){
   const scope=input.scope||'library';const d=await send({action:'search',input:{query:input.query,kind:input.kind||'title',offset:input.offset||0,scope:scope==='library'?'as':'worldcat'}});
   if(!Array.isArray(d.records)||d.records.length>10||!Number.isInteger(d.total)||d.total<0||d.records.some(r=>!/^\d{1,20}$/.test(r.oclcNumber)||typeof r.title!=='string'))fail('provider_response','The library service returned an invalid search page.');
   const records=d.records.map(r=>({oclcNumber:r.oclcNumber,title:text(r.title),author:text(r.author),year:text(r.year),publisher:text(r.publisher),format:text(r.format),edition:text(r.edition),isbns:Array.isArray(r.isbns)?r.isbns.filter(v=>typeof v==='string').slice(0,30):[],catalogUrl:safeURL(r.catalogUrl)}));
   const next=Number.isInteger(d.nextOffset)&&d.nextOffset>(input.offset||0)&&d.nextOffset<=200?d.nextOffset:null;
   return {checkedAt:text(d.checkedAt),scope,symbol:scope==='library'?'DEMO':null,libraryName:env.LIBRARY_NAME||'Configured DEMO library',query:input.query,total:d.total,offset:input.offset||0,records,nextOffset:next,truncated:(input.offset||0)+records.length<d.total,coverageComplete:false,sample:false};
  },
  async locations(oclcNumber){
   const d=await send({action:'holdings',oclcNumber});
   if(d.detailSupported!==true)return {oclcNumber,checkedAt:text(d.checkedAt),detailSupported:false,status:'unable_to_verify',message:'The library service cannot provide detailed holdings for this request.',catalogUrl:safeURL(d.catalogUrl),sample:false};
   if(!Array.isArray(d.holdings))fail('provider_response','The library service returned invalid location details.');
   return {oclcNumber,checkedAt:text(d.checkedAt),symbol:'DEMO',detailSupported:true,holdings:d.holdings.slice(0,100).map(h=>({branchCode:text(h.holdingLocation),collection:text(h.sublocationCollection),shelvingLocation:text(h.shelvingLocation),callNumber:text(h.displayCallNumber),summary:text(h.summary),statements:(Array.isArray(h.holdingParts)?h.holdingParts:[]).slice(0,20).map(p=>({summary:text(p.summaryOfHoldings),text:text(p.textualHoldings)}))})),truncated:d.holdings.length>100||d.displayTruncated===true,coverageComplete:false,catalogUrl:safeURL(d.catalogUrl),sample:false};
  }
 };
}
