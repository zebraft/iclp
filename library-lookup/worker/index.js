const encoder=new TextEncoder();
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const tools=[
 {name:'search_library_catalog',description:'Search catalog records by title, author, keyword, ISBN, ISSN or OCLC number, ten per page. Default scope=as restricts to DEMO holdings; set scope=worldcat only when the user requests worldwide discovery regardless of AS ownership. Preserve scope when paging. WorldCat-wide results do not establish AS holdings; optionally call get_library_locations for AS details. / 預設查院內 DEMO 館藏；使用者指定全球書目時設 scope=worldcat，全球結果不代表院內持有。',annotations:{readOnlyHint:true,openWorldHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{query:{type:'string',minLength:2,maxLength:300},scope:{type:'string',enum:['as','worldcat'],default:'as',description:'AS holdings by default; worldcat searches all WorldCat regardless of AS ownership. / 預設院內館藏，worldcat 為全球書目。'},kind:{type:'string',enum:['title','author','keyword','isbn','issn','oclc'],default:'title'},offset:{type:'integer',minimum:0,maximum:200}},required:['query'],additionalProperties:false}},
 {name:'get_library_locations',description:'Read local holdings by OCLC number: library code, shelving, call number and serial statements. Distinguish branches; Keep branch codes distinct. Public fields only, no barcodes or private notes. / 依 OCLC 號碼查館別、位置、索書號與卷期，保留原值。',annotations:{readOnlyHint:true,openWorldHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{oclcNumber:{type:'string',pattern:'^[0-9]{1,20}$'}},required:['oclcNumber'],additionalProperties:false}}
];
export function validate(name,args){
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid input / 輸入格式不符');
 if(name==='get_library_locations'){
  if(typeof args.oclcNumber!=='string'||!/^\d{1,20}$/.test(args.oclcNumber)||Object.keys(args).some(k=>k!=='oclcNumber'))throw Error('Invalid OCLC number / OCLC 號碼格式不符');
  return {action:'holdings',oclcNumber:args.oclcNumber};
 }
 if(name!=='search_library_catalog')throw Error('Unsupported tool / 無此查詢工具');
 if(Object.keys(args).some(k=>!['query','kind','offset','scope'].includes(k)))throw Error('Invalid search field / 查詢欄位不符');
 if(typeof args.query!=='string'||args.query.trim().length<2||args.query.length>300)throw Error('Enter 2–300 characters / 請輸入 2 至 300 字');
 const kind=args.kind||'title',offset=args.offset??0,scope=args.scope??'as';
 if(!['as','worldcat'].includes(scope))throw Error('Invalid search scope / 查詢範圍不符');
 if(!tools[0].inputSchema.properties.kind.enum.includes(kind))throw Error('Invalid search type / 查詢類型不符');
 if(!Number.isInteger(offset)||offset<0||offset>200)throw Error('Invalid page / 查詢頁數不符');
 return {action:'search',input:{query:args.query,kind,offset,scope}};
}
async function sign(secret,data){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(data)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function invoke(req,env,name,args){
 const payload=validate(name,args);
 if(!env.LIBRARY_READER_SECRET||!env.LIBRARY_BACKEND_ACCESS||env.LIBRARY_BACKEND_ORIGIN!=='https://backend-placeholder.chatgpt.site')throw Error('Library connection unavailable / 圖書館連線尚未就緒');
 const caller=req.headers.get('oai-authenticated-user-id')||req.headers.get('cf-connecting-ip')||'anonymous';
 payload.caller=await sign(env.LIBRARY_READER_SECRET,'reader:'+caller);
 const body=JSON.stringify(payload),stamp=String(Date.now());
 const response=await fetch(env.LIBRARY_BACKEND_ORIGIN+'/api/reader-service',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+env.LIBRARY_BACKEND_ACCESS,'x-library-time':stamp,'x-library-signature':await sign(env.LIBRARY_READER_SECRET,stamp+'\n'+body)},body,signal:AbortSignal.timeout(45000)});
 if(!response.ok){let d;try{d=await response.json();}catch{}throw Error(typeof d?.error==='string'?d.error:'Library request failed / 圖書館查詢未完成');}
 return response.json();
}
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Library Lookup</title><style>body{margin:0;background:#f4f8fb;color:#172f45;font:17px/1.8 system-ui,"Noto Sans TC",sans-serif}main{max-width:780px;margin:auto;padding:70px 26px}header{font-size:.9rem;letter-spacing:.12em;color:#42617a}h1{font:500 clamp(2.2rem,6vw,3.5rem)/1.15 Georgia,serif}h2{font-size:1.25rem;margin-top:2rem}.card{background:white;border:1px solid #cbd9e3;border-radius:18px;padding:28px;margin:24px 0}small{display:block;font-size:.9rem;color:#435b6d}a{color:#155d89}li{margin-bottom:12px}footer{margin-top:36px;border-top:1px solid #cbd9e3;padding-top:18px;font-size:.9rem}</style><main><header>圖書館查詢外掛 · LIBRARY LOOKUP PLUGIN</header><h1>Library Lookup</h1><p>在 ChatGPT 對話裡找書、查館別與索書號。<small>Search library records and locations from a ChatGPT conversation.</small></p><section class="card"><h2>使用方式 / How to use</h2><ol><li>在 ChatGPT 安裝並選用 Library Lookup，依畫面完成首次連線。<small>Install and select Library Lookup in ChatGPT and complete any initial connection shown.</small></li><li>直接提問：「查《唐代的文学精神》的館藏位置與索書號。」<small>Ask: “Find the library location and call number for 唐代的文学精神.”</small></li><li>不必在本頁登記讀者帳號，也不必提供 OCLC 金鑰。<small>No separate reader registration here or personal OCLC key is needed.</small></li></ol></section><h2>查詢範圍 / Scope</h2><p>書名、作者、關鍵詞、ISBN、ISSN 或 OCLC 號碼；回傳可取得的書目、館別、位置、索書號與卷期。預設查 DEMO 院內館藏；也可指定「搜尋整個 WorldCat，不限院內館藏」。全球書目結果不代表院內持有，院內未查得也不等於全院無館藏。<small>Search by title, author, keyword, ISBN, ISSN or OCLC number. Read available catalog and local holdings data. AS holdings (DEMO) is the default. Ask to search all WorldCat for worldwide discovery regardless of AS ownership; those results do not establish AS holdings.</small></p><p>目前僅提供館藏查詢，不處理個人借閱帳號、續借或採購。<small>Lookup only. Personal loans, renewals and purchasing are outside the current scope.</small></p><footer>試用版本；公開目錄發佈仍須完成審查及發布者資料。<small>Pilot version. Public-directory release still requires review and completed publisher information.</small></footer></main></html>`;
const originalReader = {async fetch(req,env){
 const path=new URL(req.url).pathname;
 if(path==='/test'){
  const escape=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  try{const params=new URL(req.url).searchParams;const found=await invoke(req,env,'search_library_catalog',{query:params.get('query')||'9787543498518',kind:params.get('kind')||'isbn',scope:params.get('scope')||'as'});const located=params.has('query')?null:await invoke(req,env,'get_library_locations',{oclcNumber:'1461237160'});return new Response('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Library Lookup connection test</title><style>body{max-width:850px;margin:40px auto;padding:20px;font:17px/1.6 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f6fa;padding:24px}</style><h1>連線測試 / Connection test</h1><p>以公開書目測試查詢與位置。 / Testing search and locations using a public catalog record.</p><pre>'+escape(JSON.stringify({search:found,locations:located},null,2))+'</pre><p><a href="/">Library Lookup</a></p></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}catch(e){return json({error:e instanceof Error?e.message:'Test incomplete'},503);}
 }
 if(path==='/')return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
 if(path!=='/mcp')return json({error:'Not found'},404);
 if(req.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
 let rpc;try{
  const raw=await req.text();if(raw.length>3000)return json({error:'Request too large'},413);rpc=JSON.parse(raw);const id=rpc.id??null;
  if(rpc.method==='server/discover')return json({jsonrpc:'2.0',id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{}}}});
  if(rpc.method==='initialize')return json({jsonrpc:'2.0',id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'library-lookup',version:'0.2.0'},instructions:'Default to scope=as. Use scope=worldcat only for explicitly requested worldwide searching. Preserve scope during pagination; worldwide records have not been checked for AS ownership. Use returned catalog data, distinguish branch codes and editions, and retain catalog links. No patron loans, renewals, orders or staff administration tools are exposed.'}});
  if(rpc.method==='notifications/initialized')return new Response(null,{status:204});
  if(rpc.method==='tools/list')return json({jsonrpc:'2.0',id,result:{tools}});
  if(rpc.method==='ping')return json({jsonrpc:'2.0',id,result:{}});
  if(rpc.method!=='tools/call')return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
  return json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(await invoke(req,env,rpc.params?.name,rpc.params?.arguments))}]}});
 }catch(e){return json({jsonrpc:'2.0',id:rpc?.id??null,result:{isError:true,content:[{type:'text',text:e instanceof Error?e.message:'Search incomplete / 查詢未完成'}]}});}
}};

// Additive, opt-in route for the existing reader Site. Does not expose staff tools.
// The original handler and reader-only invoke function are injected at deployment.
function withTestGateway(original,readerInvoke){
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
  catch{return json({error:'Library lookup did not complete; retry later'},503);}
 }};
}

export default withTestGateway(originalReader,invoke);
