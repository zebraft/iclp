// One globally named Durable Object serializes the approved service budget.
// No search text, bibliography, identity or raw IP is persisted.
export async function admit(req,env) {
 if(!env.LIMITS||!env.RATE_HASH_SECRET)return {ok:false,status:503,message:'Service quota configuration is incomplete'};
 const ip=req.headers.get('CF-Connecting-IP');
 if(!ip)return {ok:false,status:503,message:'Trusted edge identity is unavailable'};
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RATE_HASH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const day=new Date().toISOString().slice(0,10);
 const hash=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(day+'|'+ip)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 try {
  const r=await env.LIMITS.get(env.LIMITS.idFromName('library-global-budget')).fetch(new Request('https://quota.invalid/admit',{method:'POST',body:JSON.stringify({caller:hash})}));
  return r.ok?{ok:true}:{ok:false,status:r.status,message:'Library service quota reached. Retry later. / 查詢額度暫時已滿'};
 }catch{return {ok:false,status:503,message:'Service quota check unavailable'};}
}
export class Quota {
 constructor(state){this.state=state;}
 async fetch(req){
  let input;try{input=await req.json();}catch{return new Response(null,{status:400});}
  if(!/^[0-9a-f]{64}$/.test(input?.caller))return new Response(null,{status:400});
  const minute=Math.floor(Date.now()/60000),day=Math.floor(Date.now()/86400000),dailyKey='day:'+day,callerKey='minute:'+minute+':'+input.caller;
  const allowed=await this.state.storage.transaction(async storage=>{
   const daily=await storage.get(dailyKey)||0,local=await storage.get(callerKey)||0;
   if(daily>=200||local>=20)return false;
   await storage.put(dailyKey,daily+1);await storage.put(callerKey,local+1);return true;
  });
  if(!await this.state.storage.getAlarm())await this.state.storage.setAlarm(Date.now()+3600000);
  return new Response(null,{status:allowed?204:429});
 }
 async alarm(){
  const minute=Math.floor(Date.now()/60000),day=Math.floor(Date.now()/86400000),keys=await this.state.storage.list();
  for(const key of keys.keys()){const [kind,number]=key.split(':');if((kind==='day'&&Number(number)<day)||(kind==='minute'&&Number(number)<minute-2))await this.state.storage.delete(key);}
  if((await this.state.storage.list()).size)await this.state.storage.setAlarm(Date.now()+3600000);
 }
}
