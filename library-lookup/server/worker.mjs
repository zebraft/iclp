import {dispatch} from './rpc.mjs';
import {UI_HTML} from './ui-generated.mjs';
import {admit} from './quota.mjs';
import {status as providerStatus} from './provider.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(d,status=200)=>Response.json(d,{status,headers});
export async function handle(req,env={},fetcher=fetch) {
 const url=new URL(req.url),path=url.pathname;
 if(path==='/healthz')return json({ok:true,version:'0.2.0'});
 if(path==='/preview'&&env.ENABLE_PREVIEW==='true')return new Response(UI_HTML,{headers:{...headers,'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
 if(path==='/'){
  const state=providerStatus(env),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const anonymousMCP=env.PUBLIC_MCP_ENABLED==='true';
  const endpoint=escape(url.origin+(anonymousMCP?'/public-mcp':'/mcp'));
  const authenticationInstruction=anonymousMCP?'Choose <strong>No authentication / None</strong>. This public read-only endpoint does not use Sites OAuth. Never enter an OCLC key or the creator’s credentials.':'Use the Sites OAuth/sign-in flow if prompted. Sign in with your own account. Never enter an OCLC key or the creator’s credentials.';
  const connection=state.sample?'Synthetic sample mode: no live holdings.':state.configured?'Library service configured; verify each returned result and scope.':'Live library connection pending secure server configuration. Catalogue/location checks will report unavailable; list preparation and export are usable.';
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Library Selection Workbench — Test service</title><style>body{margin:0;background:#f5f7fb;color:#13273d;font:17px/1.7 system-ui,sans-serif}main{max-width:850px;margin:auto;padding:40px 22px}h1{line-height:1.2}.card{background:white;border:1px solid #c8d3df;padding:22px;border-radius:12px;margin:20px 0}code{overflow-wrap:anywhere}a{color:#075a70}li{margin:12px 0}.status{border-left:5px solid #ad6e00}small{color:#435a70}button{font:inherit}</style><main><p>COLLEAGUE TEST SERVICE · 同事測試</p><h1>Library Selection Workbench</h1><p>Book-list preparation, library evidence, conversational selection and CSV export. / 書單整理、館藏依據、選書及匯出。</p><section class="card status"><h2>Connection status / 連線狀態</h2><p>'+escape(connection)+'</p><p>No OpenAI directory submission, approval or publication is claimed.</p></section><section class="card"><h2>Connect from ChatGPT / 從 ChatGPT 連線</h2><ol><li>Open ChatGPT Plugins and choose <strong>Add custom MCP server</strong>.</li><li>Name it <strong>Library Selection Test</strong>. Enter:<p><code>'+endpoint+'</code></p></li><li>'+authenticationInstruction+'</li><li>Review the tool permissions, create/install the connection, and open a fresh conversation with it selected.</li><li>Ask: “Check the service status, then prepare book-1 titled Example book and export only book-1 as CSV. Do not submit anything.”</li></ol><p>Custom MCP access depends on your ChatGPT account/workspace policy. If the option is absent or blocked, ask your workspace administrator. Installing the tools does not automatically install the two workflow skills.</p></section><section class="card"><h2>What this test covers</h2><p>Seven tools, explicit holdings uncertainty, results returned directly to the conversation. No patron accounts, private profiles, email, spreadsheet writes, recommendation submission or purchases.</p>'+(env.ENABLE_PREVIEW==='true'?'<p><a href="/preview">Open the standalone interface / 開啟介面</a></p>':'')+'<p>The service is not listed in the public directory. Access is governed by its Sites permissions. Do not share private lists or secrets. Selection and export data are not stored by this application.</p></section><small>Report the client/build, tool name and redacted error to the release owner through your existing colleague contact. This page is a development guide, not final public privacy or support policy.</small></main></html>';
  return new Response(html,{headers:{...headers,'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
 }
 if(path!=='/mcp'&&path!=='/api/tools'&&path!=='/public-mcp')return json({error:'Not found'},404);
 if(path==='/public-mcp'&&env.PUBLIC_MCP_ENABLED!=='true')return json({error:'Not found'},404);
 const mode=providerStatus(env).mode;
 if(env.RELEASE_CHANNEL==='public'&&!['oclc','sites-bridge'].includes(mode))return json({error:'Public live service configuration is incomplete'},503);
 const origin=req.headers.get('Origin');
 if(origin && origin!==url.origin && origin!==env.ALLOWED_ORIGIN && !(path==='/public-mcp'&&origin==='https://chatgpt.com'))return json({error:'Origin not allowed'},403);
 if(req.method==='GET'||req.method==='DELETE')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
 if(req.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
 if(!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'Expected application/json'},415);
 const length=Number(req.headers.get('Content-Length'));if(length>96_000)return json({error:'Request too large'},413);
 let raw='',bytes=0;const decoder=new TextDecoder();const reader=req.body?.getReader();if(!reader)return json({error:'Empty request'},400);
 for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>96_000){await reader.cancel();return json({error:'Request too large'},413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
 let rpc;try{rpc=JSON.parse(raw);}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},400);}
 if(path==='/api/tools'&&rpc?.method!=='tools/call')return json({error:'Only tool calls are supported on this browser route'},400);
 if(env.RELEASE_CHANNEL==='public'&&mode==='oclc'&&rpc.method==='tools/call'&&['check_holdings','search_library_catalog','search_articles','get_library_locations'].includes(rpc.params?.name)){
  const quota=await admit(req,env);if(!quota.ok)return json({error:quota.message},quota.status);
 }
 const response=await dispatch(rpc,env,UI_HTML,fetcher,req);
 return response===null?new Response(null,{status:202,headers}):json(response);
}
// Worker runtimes pass ExecutionContext as the third argument. It is not the
// optional fetch implementation used by handle's unit-test harness.
export default {fetch(req,env){return handle(req,env);}};
export {Quota} from './quota.mjs';
