import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const compiled=await build({stdin:{contents:`
import {saveCredentials,getLibraryCredentials,getLibrarySettings,saveLibraryCredentials,removeLibraryCredentials,requireLibraryAdmin} from './lib/credentials';
export default {async fetch(req){
 if(new URL(req.url).pathname==='/ambiguous'){
  await saveCredentials('one','a','b');await saveCredentials('two','c','d');
  try{await getLibrarySettings();return Response.json({denied:false});}catch{return Response.json({denied:true});}
 }
 await saveCredentials('original-admin','fixture-id','fixture-secret');
 const c=await getLibraryCredentials();
 let otherDenied=false;try{await saveLibraryCredentials('other-librarian','evil','evil');}catch{otherDenied=true;}
 let removeDenied=false;try{await removeLibraryCredentials('other-librarian');}catch{removeDenied=true;}
 const unchanged=await getLibraryCredentials();
 await requireLibraryAdmin('original-admin');
 await saveLibraryCredentials('original-admin','replacement','replacement-secret');
 const replaced=await getLibraryCredentials();
 await removeLibraryCredentials('original-admin');
 const removed=await getLibraryCredentials();
 const tombstone=await getLibrarySettings();
 return Response.json({promoted:c.id==='fixture-id'&&c.ownerId==='original-admin',otherDenied,removeDenied,unchanged:unchanged.id==='fixture-id',replaced:replaced.id==='replacement',removed:removed===null,ownershipRetained:tombstone.ownerId==='original-admin'});
}};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
async function run(path){const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',d1Databases:['DB'],bindings:{CREDENTIAL_ENCRYPTION_KEY:'a'.repeat(64)}});try{const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE credentials (user_id TEXT PRIMARY KEY, sealed TEXT NOT NULL, updated_at TEXT NOT NULL)');return await(await mf.dispatchFetch('http://localhost'+path)).json();}finally{await mf.dispose();}}
test('Institutional credentials migrate, remain encrypted, and enforce administrator-only changes',async()=>{const r=await run('/');assert.deepEqual(r,{promoted:true,otherDenied:true,removeDenied:true,unchanged:true,replaced:true,removed:true,ownershipRetained:true});});
test('Ambiguous legacy credentials fail closed',async()=>assert.deepEqual(await run('/ambiguous'),{denied:true}));
