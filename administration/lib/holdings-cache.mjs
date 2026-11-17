import {STRATEGY_VERSION,identity} from './worldcat.mjs';
const inflight=new Map();
export const POSITIVE_TTL=24*60*60*1000,NEGATIVE_TTL=60*60*1000;
const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export function identityKey(input){return JSON.stringify([STRATEGY_VERSION,'AAE',norm(input.title),String(input.isbn||'').toUpperCase(),norm(input.author)]);}
export async function hashKey(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function ttl(report){if(report.incomplete)return 0;return report.earlyStopped?POSITIVE_TTL:report.metrics?.searchRequests>0?NEGATIVE_TTL:0;}
function restore(report,input,cache,elapsedMs){
 const r=structuredClone(report);r.input=input;
 r.bibliographicWarnings=(r.bibliographicWarnings||[]).filter(w=>w.reason!=='source_date_differs_from_catalog_year');
 const sourceYear=String(input.sourceListDate||'').match(/20\d{2}/)?.[0];
 const catalogYears=[...new Set(r.checks?.flatMap(c=>c.records).map(b=>String(b.year||'').match(/(?:19|20)\d{2}/)?.[0]).filter(Boolean))];
 if(sourceYear&&catalogYears.some(y=>y!==sourceYear))r.bibliographicWarnings.push({reason:'source_date_differs_from_catalog_year',sourceListDate:input.sourceListDate,catalogYears});
 if(cache.hit)r.metrics={...r.metrics,originalSearchRequests:r.metrics?.searchRequests||0,originalHoldingsRequests:r.metrics?.holdingsRequests||0,searchRequests:0,holdingsRequests:0,elapsedMs};
 r.cache=cache;r.servedAt=new Date().toISOString();return r;
}
export async function cachedCheck(input,namespace,store,run,now=Date.now,force=false){
 const started=now(),key=await hashKey(namespace+'|'+identityKey(input));
 let cached;try{cached=await store.get(key);}catch{/* Cache availability cannot suppress a fresh check. */}
 if(!force&&cached&&cached.expiresAt>now()&&cached.version===STRATEGY_VERSION){
  const r=cached.report;
  // Alias reuse must still identify this requested ISBN/title.
  if(!cached.alias||r.checks?.some(c=>c.records.some(b=>identity(input,b).verified)))return restore(r,input,{hit:true,scope:'library',storedAt:cached.storedAt,expiresAt:new Date(cached.expiresAt).toISOString(),originalCheckedAt:r.checkedAt,alias:!!cached.alias},now()-started);
 }
 if(inflight.has(key)){
  const r=await inflight.get(key);return restore(r,input,{hit:true,scope:'library',coalesced:true,originalCheckedAt:r.checkedAt},now()-started);
 }
 const promise=(async()=>{
  const report=await run(input),duration=ttl(report);
  // Never persist source URLs, staff identifiers or input provenance across visitors.
  const saved=structuredClone(report);saved.input={title:input.title,...(input.isbn?{isbn:input.isbn}:{}),...(input.author?{author:input.author}:{})};
  if(duration){const entry={version:STRATEGY_VERSION,storedAt:new Date(now()).toISOString(),expiresAt:now()+duration,report:saved};
   try{
    await store.set(key,entry);
    if(report.earlyStopped){
     const isbns=new Set(report.checks.flatMap(c=>c.records).filter(b=>identity(input,b).verified&&(b.isbns?.length||0)<=4).flatMap(b=>b.isbns));
     for(const isbn of isbns){if(isbn===input.isbn)continue;const aliasKey=await hashKey(namespace+'|'+identityKey({...input,isbn}));await store.set(aliasKey,{...entry,alias:true});}
    }
   }catch{/* A failed cache write does not discard live evidence. */}
  }
  return report;
 })();
 inflight.set(key,promise);
 try{return restore(await promise,input,{hit:false,scope:'library'},now()-started);}finally{inflight.delete(key);}
}
export async function mapLimit(items,limit,fn){const results=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await fn(items[index],index);}}));return results;}
