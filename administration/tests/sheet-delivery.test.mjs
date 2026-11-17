import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {build} from 'esbuild';import {Miniflare} from 'miniflare';
import {signedEnvelope} from '../lib/apps-script.mjs';
const compiled=await build({stdin:{contents:`
import {env} from 'cloudflare:workers';
import {saveCredentials,getLibrarySettings} from './lib/credentials';
import {configureAppsScript,directSync,handleScheduledRetry,googleStatus,assertDeliveryWorkbook} from './lib/sheet-sync';
import {createReview,submitReview,readReview,candidateSheetTitle} from './lib/recommendations.mjs';
import {writeResponse} from './lib/reconciliation.mjs';
import {verifyEnvelope} from './lib/apps-script.mjs';
import {sheetsFixture} from './tests/helpers/sheets-fixture.mjs';
let issue,fixture,review,failWrites=false;const secret='a'.repeat(64);
globalThis.fetch=async(url,init)=>{const request=await verifyEnvelope(JSON.parse(init.body),secret);if(request.action==='probe')return Response.json({ok:true,result:{spreadsheetId:'workbook',retryTriggerInstalled:true}});if(failWrites)return Response.json({ok:false,error:'sync_failed'});return Response.json({ok:true,result:await writeResponse(fixture.api,request.issue,request.response)});};
export default {async fetch(req){try{const a=await req.json();let result;
if(a.action==='init'){await saveCredentials('admin','id','secret');await getLibrarySettings();issue=a.issue;fixture=sheetsFixture({...issue,researcherSheet:candidateSheetTitle(issue.researcher)});review=await createReview(env.DB,'admin',issue);result={id:review.id};}
if(a.action==='submit'){const saved=await submitReview(env.DB,review.id,review.token,{reviewed:true,baseRevision:a.revision-1,idempotencyKey:'r'+a.revision,selectedBookIds:a.selected,confirmNone:a.selected.length===0},'personal-link');result={saved,sync:await directSync(saved.id)};}
if(a.action==='connect')result=await configureAppsScript('admin','https://script.google.com/macros/s/test/exec',secret,issue.workbookUrl);
if(a.action==='retry')result=await handleScheduledRetry(a.envelope);
if(a.action==='target'){await assertDeliveryWorkbook(a.url);result={ok:true};}
if(a.action==='fail'){failWrites=a.value;result={ok:true};}
if(a.action==='read')result={review:await readReview(env.DB,review.id,review.token),values:fixture.values,status:await googleStatus()};
return Response.json(result);}catch(e){return Response.json({error:e.message},{status:400});}}};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
test('Workers+D1 retries retain failures, verify signed callbacks, reject replay and apply revisions',async()=>{
 const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',d1Databases:['DB'],bindings:{CREDENTIAL_ENCRYPTION_KEY:'a'.repeat(64)}});try{
 const db=await mf.getD1Database('DB');for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){for(const sql of (await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')).split('--> statement-breakpoint'))await db.prepare(sql).run();}
 const call=async body=>{const r=await mf.dispatchFetch('http://local',{method:'POST',body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const issue={issue:'PILOT',researcher:'Test Researcher',recipient:'test@example.org',profileZh:'文學',profileEn:'Literature',workbookUrl:'https://docs.google.com/spreadsheets/d/workbook/edit',books:[{number:1,bookId:'b1',title:'Book',sheetRow:2}]};
 assert.equal((await call({action:'init',issue})).status,200);
 const first=(await call({action:'submit',revision:1,selected:['b1']})).body;assert.equal(first.sync.reason,'google_authorization_required');
 assert.equal((await call({action:'connect'})).body.healthy,true);
 assert.equal((await call({action:'target',url:issue.workbookUrl})).status,200);assert.equal((await call({action:'target',url:'https://docs.google.com/spreadsheets/d/other/edit'})).status,400);
 await call({action:'fail',value:true});const pending=await call({action:'retry',envelope:await signedEnvelope({action:'retry'},'a'.repeat(64))});assert.equal(pending.body.synced,0);assert.equal((await call({action:'read'})).body.review.latest.workbookSynced,false);
 await call({action:'fail',value:false});const envelope=await signedEnvelope({action:'retry'},'a'.repeat(64));assert.equal((await call({action:'retry',envelope})).body.synced,1);assert.equal((await call({action:'retry',envelope})).status,400);
 const read=(await call({action:'read'})).body;assert.equal(read.review.latest.workbookSynced,true);assert.ok(read.status.lastRetryAt);assert.equal(read.values[0].length,2);
 assert.equal((await call({action:'submit',revision:2,selected:[]})).body.sync.synced,true);assert.equal((await call({action:'read'})).body.values[0][1][10],'不採購 / Declined');
 assert.equal((await call({action:'submit',revision:3,selected:['b1']})).body.sync.synced,true);const last=(await call({action:'read'})).body;assert.equal(last.values[0].length,2);assert.equal(last.values[0][1][10],'待確認 / Review');assert.equal(last.values[1].length,4);
 assert.equal((await call({action:'retry',envelope:{...await signedEnvelope({action:'retry'},'b'.repeat(64))}})).status,400);
 }finally{await mf.dispose();}
});
