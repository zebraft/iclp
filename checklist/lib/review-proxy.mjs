const BACKEND='https://administration.example.invalid';
const fail=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export async function proxyReview(req,id,serviceToken,send=fetch){
 if(!/^[a-f0-9-]{36}$/.test(id))return fail('連結無效 / Invalid link',404);
 const token=req.headers.get('X-Review-Token')||'';
 if(token.length<40||token.length>200)return fail('請使用薦購信中的完整個人連結 / Use the complete personal link from your email',404);
 if(!serviceToken)return fail('服務暫時無法使用，請直接回信 / Service unavailable; please reply by email',503);
 if(!['GET','POST'].includes(req.method))return fail('不支援此操作 / Method not allowed',405);
 if(req.method==='POST'&&req.headers.get('origin')!==new URL(req.url).origin)return fail('來源驗證失敗 / Origin check failed',403);
 const body=req.method==='POST'?await req.text():undefined;
 if(body&&body.length>24000)return fail('內容過長 / Request too large',413);
 try{
 const result=await send(BACKEND+'/api/recommendations/'+id,{method:req.method,headers:{'OAI-Sites-Authorization':'Bearer '+serviceToken,'X-Review-Token':token,'Content-Type':'application/json',Accept:'application/json',Origin:BACKEND},...(body!==undefined?{body}:{}),redirect:'manual'});
 if(!result.headers.get('content-type')?.includes('application/json'))return fail('服務暫時無法使用，請直接回信 / Service unavailable; please reply by email',503);
 const text=await result.text();if(text.length>1500000)return fail('回應過長 / Unexpected response',502);
 return new Response(text,{status:result.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 }catch{return fail('連線未完成，請重試或直接回信 / Connection incomplete; retry or reply by email',503);}
}
