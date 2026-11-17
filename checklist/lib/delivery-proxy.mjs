const BACKEND='https://administration.example.invalid/api/sheets/retry';
export async function proxyDelivery(req,serviceToken,send=fetch){
 const fail=(status)=>Response.json({error:'Delivery retry unavailable'},{status,headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST')return fail(405);if(!serviceToken)return fail(503);
 const body=await req.text();if(body.length>10000)return fail(413);
 let envelope;try{envelope=JSON.parse(body);if(typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||envelope.signature.length!==64||!Number.isSafeInteger(envelope.timestamp)||typeof envelope.nonce!=='string')return fail(403);}catch{return fail(403);}
 try{const r=await send(BACKEND,{method:'POST',headers:{'OAI-Sites-Authorization':'Bearer '+serviceToken,'Content-Type':'application/json'},body,redirect:'manual',signal:AbortSignal.timeout(240000)});if(!r.headers.get('content-type')?.includes('application/json'))return fail(503);const text=await r.text();if(text.length>10000)return fail(502);return new Response(text,{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}catch{return fail(503);}
}
