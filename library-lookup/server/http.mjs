import http from 'node:http';
import {handle} from './worker.mjs';
const port=Number(process.env.PORT||8788),env={...process.env};
if(env.LIBRARY_MODE==='sample') env.ENABLE_PREVIEW='true';
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){res.writeHead(403);res.end('Invalid host');return;}
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>96_000){res.writeHead(413);res.end('Request too large');return;}chunks.push(c);}
  const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  const response=await handle(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Content-Type':'text/plain'});res.end('Request failed');}
});
server.listen(port,'127.0.0.1',()=>console.error(`Library preview: http://127.0.0.1:${port}/preview`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));
