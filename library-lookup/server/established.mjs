// Compatibility shell for the established Site. Catalogue logic lives in service.mjs.
import worker from './worker.mjs';
import {LOOKUP_HOME} from './lookup-home-generated.mjs';
import {withTestGateway} from './test-gateway.mjs';
import {createSitesTransport} from './sites-provider.mjs';
import {tools,validate,UserError} from './contracts.mjs';

export async function legacyReader(req,env,name,args,fetcher=fetch){
 if(env.LIBRARY_READER_TRANSPORT==='test-gateway')throw new UserError('not_configured','A gateway must use its direct upstream transport.');
 if(!['search_library_catalog','get_library_locations'].includes(name))throw new UserError('unsupported_tool','Unsupported reader operation');
 const tool=tools.find(t=>t.name===name);validate(args,tool.inputSchema);
 const {send}=createSitesTransport(env,fetcher,req);
 return send(name==='search_library_catalog'?{action:'search',input:{...args,scope:args.scope==='worldcat'?'worldcat':'as'}}:{action:'holdings',oclcNumber:args.oclcNumber});
}
const base={async fetch(req,env,ctx){
 // Preserve the existing diagnostics route, without adding a private-data surface.
 const path=new URL(req.url).pathname;
 if(path==='/')return new Response(LOOKUP_HOME,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
 if(path==='/test'||path==='/api/connection-test'){
  const q=new URL(req.url).searchParams;
  try{
   const search=await legacyReader(req,env,'search_library_catalog',{query:q.get('query')||'9787543498518',kind:q.get('kind')||'isbn',scope:q.get('scope')||'as'});
   const locations=q.has('query')?null:await legacyReader(req,env,'get_library_locations',{oclcNumber:'1461237160'});
   const data={search,locations};
   if(path==='/api/connection-test')return Response.json(data,{headers:{'Cache-Control':'no-store'}});
   const escaped=JSON.stringify(data,null,2).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
   return new Response('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>Library Lookup connection test</title><h1>連線測試 / Connection test</h1><pre>'+escaped+'</pre><a href="/">Library Lookup</a></html>',{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}});
  }
  catch{return Response.json({error:'Library connection test failed'},{status:503});}
 }
 if(!['/mcp','/healthz'].includes(path))return Response.json({error:'Not found'},{status:404});
 // Legacy aliases affect request compatibility; responses retain canonical scope
 // plus a separate legacyScope marker, not a different service implementation.
 return worker.fetch(req,env,ctx);
}};
export default withTestGateway(base,legacyReader);
export {Quota} from './quota.mjs';
