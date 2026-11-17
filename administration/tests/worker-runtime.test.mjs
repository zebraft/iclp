import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
const source=await readFile(new URL('../lib/worldcat.mjs',import.meta.url),'utf8');
test('Actual Workers runtime accepts auth and API request options',async()=>{
 const script=source.replace(/^export /gm,'')+`
 export default { async fetch() {
  let originalThrows=false;
  try { new Request('https://oauth.oclc.org/token',{redirect:'error'}); } catch {originalThrows=true;}
  let authMode,apiMode;
  const auth=await authenticate('fixture-id','fixture-secret',async(url,init)=>{new Request(url,init);authMode=init.redirect;return new Response(JSON.stringify({access_token:'fixture-token'}));});
  const send=transport(auth.token,async(url,init)=>{new Request(url,init);apiMode=init.redirect;return new Response(JSON.stringify({numberOfRecords:0}));});
  const response=await send('brief-bibs',{q:'fixture'});
  return Response.json({originalThrows,authMode,apiMode,http:response.http});
 }};`;
 const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-15'});
 try {const r=await mf.dispatchFetch('http://localhost/');const d=await r.json();assert.equal(d.originalThrows,true);assert.equal(d.authMode,'manual');assert.equal(d.apiMode,'manual');assert.equal(d.http,200);}finally{await mf.dispose();}
});
