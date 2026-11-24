// Short-lived, isolate-local caches of projected public catalogue data only.
export function createCache({now=Date.now,maxEntries=128,maxBytes=4000000}={}) {
 const entries=new Map(),pending=new Map();let usedBytes=0;
 const remove=key=>{const entry=entries.get(key);if(entry)usedBytes-=entry.bytes;entries.delete(key);};
 const clone=value=>JSON.parse(JSON.stringify(value));
 return {
  delete(key){remove(key);pending.delete(key);},
  async get(key,load,{refresh=false,ttl=300000}={}) {
   const stored=entries.get(key);
   if(!refresh&&stored&&stored.expiresAt>now())return {value:clone(stored.value),hit:true,expiresAt:stored.expiresAt};
   if(!refresh&&pending.has(key)){const r=await pending.get(key);return {...r,value:clone(r.value),hit:true};}
   remove(key);
   const work=(async()=>{const value=await load(),duration=typeof ttl==='function'?ttl(value):ttl,expiresAt=now()+Math.max(0,duration);
    const bytes=new TextEncoder().encode(JSON.stringify(value)).length;
    if(pending.get(key)===work&&duration>0&&maxEntries>0&&bytes<=maxBytes){for(const [k,e]of entries)if(e.expiresAt<=now())remove(k);while(entries.size>=maxEntries||usedBytes+bytes>maxBytes)remove(entries.keys().next().value);remove(key);entries.set(key,{value:clone(value),expiresAt,bytes});usedBytes+=bytes;}
    return {value,hit:false,expiresAt};
   })();
   pending.set(key,work);
   try{const r=await work;return {...r,value:clone(r.value)};}finally{if(pending.get(key)===work)pending.delete(key);}
  }
 };
}
const resultPools=new WeakMap(),tokenPools=new WeakMap();
const pool=(pools,fetcher)=>{let value=pools.get(fetcher);if(!value){value=createCache();pools.set(fetcher,value);}return value;};
async function namespace(env){
 const keys=['LIBRARY_MODE','LIBRARY_SYMBOL','LIBRARY_NAME','LIBRARY_CATALOG_ORIGIN','OCLC_CLIENT_ID','OCLC_CLIENT_SECRET','LIBRARY_READER_TRANSPORT','LIBRARY_BACKEND_ORIGIN','LIBRARY_BACKEND_ACCESS','LIBRARY_READER_SECRET','LIBRARY_TEST_GATEWAY_ORIGIN','LIBRARY_TEST_GATEWAY_SECRET','RELEASE_CHANNEL','LIBRARY_PUBLIC_AUTHORIZED'];
 const bytes=new TextEncoder().encode(JSON.stringify(keys.map(k=>env[k]??null)));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function cachedProvider(provider,env,fetcher){
 const cache=pool(resultPools,fetcher),ns=await namespace(env);
 const read=async(key,load,refresh)=>{const r=await cache.get(ns+key,load,{refresh,ttl:v=>v.detailSupported===false?0:Array.isArray(v.records)&&v.records.length===0?60000:300000});return {...r.value,cache:{hit:r.hit,originalCheckedAt:r.value.checkedAt||null,expiresAt:new Date(r.expiresAt).toISOString()}};};
 return {
  search(input,options={}){const key=JSON.stringify([input.scope||'library',input.kind||'title',input.query.trim(),input.offset||0]);return read('search:'+key,()=>provider.search(input),options.refresh===true);},
  locations(id,options={}){return read('locations:'+id,()=>provider.locations(id),options.refresh===true);}
 };
}
export async function cachedToken(env,fetcher,scope,load){
 const key=await namespace(env)+':'+scope,cache=pool(tokenPools,fetcher);
 const r=await cache.get(key,load,{ttl:v=>Math.max(0,Math.min(Number(v.expiresIn)||300,3600)-60)*1000});
 return r.value.token;
}
export async function invalidateToken(env,fetcher,scope){pool(tokenPools,fetcher).delete(await namespace(env)+':'+scope);}
