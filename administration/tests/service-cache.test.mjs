import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {Miniflare} from 'miniflare';
const built=await build({stdin:{contents:`
import {saveCredentials,getLibraryCredentials} from './lib/credentials';
import {checkBooks} from './lib/service';
import {env} from 'cloudflare:workers';
let requests=0,auth=0;
const b={oclcNumber:'verified',title:'Exile and Invention in the Prose Writings of Su Shi',creator:'Ronald Egan',specificFormat:'PrintBook',isbns:['9780674307537'],date:'2026'};
globalThis.fetch=async(url,opts)=>{requests++;if(String(url).includes('oauth.oclc.org')){auth++;return Response.json({access_token:'fixture-token',expires_in:3600});}const u=new URL(url);return Response.json({numberOfRecords:1,briefRecords:[{...b,...(u.pathname.endsWith('bibs-holdings')?{institutionHolding:{totalHoldingCount:1,briefHoldings:[{institutionNumber:11128}]}}:{})}]});};
export default {async fetch(){
 await saveCredentials('admin','fixture-id','fixture-secret');await getLibraryCredentials();
 let anonymousDenied=false;try{await checkBooks('',[]);}catch{anonymousDenied=true;}
 const input={title:b.title,isbn:b.isbns[0],author:'Egan, Ronald',source:'private-source-one'};
 const a=await checkBooks('librarian-a',[input,{...input,source:'private-source-two'}]);const afterFirst=requests;
 const second=await checkBooks('librarian-b',[{...input,source:'different-source'}]);const afterSecond=requests;
 const fresh=await checkBooks('librarian-b',[input],{refresh:true});
 const rows=await env.DB.prepare('SELECT payload FROM holdings_cache').all();
 return Response.json({anonymousDenied,afterFirst,afterSecond,afterFresh:requests,auth,firstCount:a.reports.length,firstSources:a.reports.map(r=>r.input.source),secondHit:second.reports[0].cache.hit,secondSource:second.reports[0].input.source,freshHit:fresh.reports[0].cache.hit,leak:JSON.stringify(rows).includes('private-source')});
}};`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
test('Actual Worker and D1 share cache across librarians, isolate provenance, refresh explicitly and retain auth rules',async()=>{const mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-05-15',d1Databases:['DB'],bindings:{CREDENTIAL_ENCRYPTION_KEY:'b'.repeat(64)}});try{const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE credentials (user_id TEXT PRIMARY KEY,sealed TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE holdings_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at INTEGER NOT NULL)');const r=await(await mf.dispatchFetch('http://localhost/')).json();assert.deepEqual(r,{anonymousDenied:true,afterFirst:3,afterSecond:3,afterFresh:5,auth:1,firstCount:2,firstSources:['private-source-one','private-source-two'],secondHit:true,secondSource:'different-source',freshHit:false,leak:false});}finally{await mf.dispose();}});
