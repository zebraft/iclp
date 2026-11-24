// Additive, opt-in route for the existing reader Site. Does not expose staff tools.
// The original handler and reader-only invoke function are injected at deployment.
export function withTestGateway(original,readerInvoke){
 return {async fetch(req,env,ctx){
  if(new URL(req.url).pathname!=='/api/library-test-reader')return original.fetch(req,env,ctx);
  const json=(d,status)=>Response.json(d,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(req.method!=='POST')return json({error:'POST required'},405);
  if(!env.LIBRARY_TEST_GATEWAY_SECRET)return json({error:'Test gateway disabled'},503);
  const stamp=req.headers.get('x-library-time')||'',signature=req.headers.get('x-library-signature')||'';
  if(!/^\d{13}$/.test(stamp)||Math.abs(Date.now()-Number(stamp))>60000||!/^[a-f0-9]{64}$/.test(signature))return json({error:'Test service authentication required'},401);
  let body='',bytes=0;const reader=req.body?.getReader(),decoder=new TextDecoder();if(!reader)return json({error:'Empty request'},400);
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2200){await reader.cancel();return json({error:'Request too large'},413);}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.LIBRARY_TEST_GATEWAY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytesSignature=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16));
  if(!await crypto.subtle.verify('HMAC',key,bytesSignature,new TextEncoder().encode(stamp+'\n'+body)))return json({error:'Test service authentication failed'},401);
  let payload;try{payload=JSON.parse(body);}catch{return json({error:'Invalid JSON'},400);}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!/^[a-f0-9]{64}$/.test(payload.caller||''))return json({error:'Invalid caller'},400);
  let name,args;
  if(payload.action==='search'&&Object.keys(payload).every(k=>['action','input','caller'].includes(k))){name='search_library_catalog';args=payload.input;}
  else if(payload.action==='holdings'&&Object.keys(payload).every(k=>['action','oclcNumber','caller'].includes(k))){name='get_library_locations';args={oclcNumber:payload.oclcNumber};}
  else return json({error:'Unsupported read operation'},400);
  // readerInvoke performs the original validation, signing and upstream quotas.
  // Neither request headers nor user inputs can select staff/account operations.
  try{return json(await readerInvoke(req,env,name,args),200);}
  catch(e){
   const status=({provider_quota:429,permission_denied:403,provider_auth:403,invalid_input:400})[e?.code]||503;
   return json({error:status===429?'Library query quota reached':status===403?'Library access denied':'Library lookup did not complete; retry later'},status);
  }
 }};
}
