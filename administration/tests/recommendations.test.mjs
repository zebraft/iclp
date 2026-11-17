import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {validateIssue,validateResponse,publicReview,candidateSheetTitle} from '../lib/recommendations.mjs';
const issue={issue:'pilot-03',researcher:'測試研究者 Test Researcher',recipient:'researcher@example.invalid',profileZh:'測試主題',profileEn:'Test topic',workbookUrl:'https://docs.google.com/spreadsheets/d/pilot/edit',books:Array.from({length:62},(_,i)=>({number:i+1,bookId:'book-'+i,title:'Book '+(i+1),isbn:'9780000000000',sheetRow:i+18}))};
test('immutable issue numbering, unique IDs and safe links',()=>{assert.equal(validateIssue(issue).books.length,62);assert.throws(()=>validateIssue({...issue,books:[issue.books[1]]}));assert.throws(()=>validateIssue({...issue,books:[{...issue.books[0],sourceUrl:'javascript:alert(1)'}]}));});
test('explicit review, none and valid IDs required',()=>{const raw={reviewed:true,baseRevision:0,idempotencyKey:'retry-key',selectedBookIds:['book-0','book-61']};assert.deepEqual(validateResponse(raw,issue).selectedBooks.map(b=>b.number),[1,62]);assert.throws(()=>validateResponse({...raw,selectedBookIds:['unlisted']},issue));assert.throws(()=>validateResponse({...raw,reviewed:false},issue));assert.throws(()=>validateResponse({...raw,selectedBookIds:[]},issue));assert.equal(validateResponse({...raw,selectedBookIds:[],confirmNone:true},issue).confirmNone,true);assert.equal(validateResponse({...raw,selectedBookIds:issue.books.map(b=>b.bookId)},issue).selectedBooks.length,62);});
test('Workers+D1 durable submission, retries, amendments and owner isolation',async()=>{
 const source=await readFile(new URL('../lib/recommendations.mjs',import.meta.url),'utf8');
 const script=source.replace(/^export /gm,'')+`\nexport default {async fetch(req,env){try{let {action,...a}=await req.json();let value;if(action==='create')value=await createReview(env.DB,a.owner,a.issue);if(action==='read')value=await readReview(env.DB,a.id,a.token);if(action==='submit')value=await submitReview(env.DB,a.id,a.token,a.data,a.actor);if(action==='list')value=await listResponses(env.DB,a.owner,a.id);if(action==='sync')value=await markSynced(env.DB,a.owner,a.responseId,a.receipt);return Response.json(value);}catch(e){return Response.json({error:e.message},{status:e.status||500});}}};`;
 const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-15',d1Databases:['DB']});
 const db=await mf.getD1Database('DB');
 const migration=await readFile(new URL('../drizzle/0002_cooing_omega_flight.sql',import.meta.url),'utf8');
 for(const sql of migration.split('--> statement-breakpoint'))await db.prepare(sql).run();
 const call=async data=>{const r=await mf.dispatchFetch('http://localhost',{method:'POST',body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 try{
 const c=(await call({action:'create',owner:'librarian',issue})).body;assert.ok(c.id);assert.ok(c.token);
 assert.equal((await call({action:'read',id:c.id,token:'invalid'})).status,404);
 const read=(await call({action:'read',id:c.id,token:c.token})).body;assert.equal(read.latest,null);assert.equal(read.books.length,62);
 const data={reviewed:true,baseRevision:0,idempotencyKey:'once',selectedBookIds:['book-0','book-61'],profileChange:'Also translation',feedback:'Useful'};
 const submit={action:'submit',id:c.id,token:c.token,actor:'researcher',data};
 const first=(await call(submit)).body;assert.equal(first.selectedCount,2);assert.equal(first.revision,1);
 assert.equal((await call(submit)).body.id,first.id);
 assert.equal((await call({...submit,data:{...data,selectedBookIds:['book-0']}})).status,409);
 assert.equal((await call({...submit,data:{...data,idempotencyKey:'stale'}})).status,409);
 const rows=(await call({action:'list',owner:'librarian',id:c.id})).body;assert.equal(rows[0].responses.length,1);assert.equal(rows[0].responses[0].feedback,'Useful');assert.equal(rows[0].responses[0].profileChange,'Also translation');assert.equal(rows[0].responses[0].purchaseReady,false);assert.deepEqual(rows[0].responses[0].selectedBooks.map(b=>b.number),[1,62]);
 assert.deepEqual((await call({action:'list',owner:'other-librarian',id:c.id})).body,[]);
 const receipt={workbookUrl:issue.workbookUrl,range:'Replies!A2:H2',readbackVerified:true};
 assert.equal((await call({action:'sync',owner:'other-librarian',responseId:first.id,receipt})).status,404);
 assert.equal((await call({action:'sync',owner:'librarian',responseId:first.id,receipt:{...receipt,readbackVerified:false}})).status,400);
 assert.equal((await call({action:'sync',owner:'librarian',responseId:first.id,receipt})).body.synced,true);
 const amendment=await call({...submit,data:{...data,baseRevision:1,idempotencyKey:'amend',selectedBookIds:issue.books.map(b=>b.bookId)}});assert.equal(amendment.body.revision,2);assert.equal(amendment.body.selectedCount,62);
 const latest=(await call({action:'read',id:c.id,token:c.token})).body;assert.equal(latest.latest.revision,2);
 const all=(await call({action:'list',owner:'librarian',id:c.id})).body;assert.equal(all[0].responses.length,2);assert.ok(all[0].responses[0].syncedAt);assert.equal(all[0].responses[1].syncedAt,null);
 }finally{await mf.dispose();}
});

test('personal checklist responses omit staff destinations, emails, row mappings and private links',()=>{
 const staffIssue={...issue,books:[{...issue.books[0],sourceUrl:'https://docs.google.com/spreadsheets/d/private-source/edit',googleUrl:'https://www.google.com/search?q=Book',catalogUrl:'https://aslib.on.worldcat.org/search?queryString=Book'}],staffOnly:'never expose'};
 const latest={id:'r1',revision:1,selectedBookIds:['book-0'],selectedBooks:staffIssue.books,feedback:'My feedback',profileChange:'My topic',workbookSynced:true,syncReceipt:{workbookUrl:issue.workbookUrl},actorId:'private-user'};
 const response=publicReview('test-issue',staffIssue,latest),serialized=JSON.stringify(response);
 for(const key of ['workbookUrl','recipient','sheetRow','selectedBooks','syncReceipt','staffOnly','actorId','private-source','profileZh','profileEn','researcher','reason','My feedback','My topic'])assert.equal(serialized.includes(key),false,key);
 assert.equal(response.latest.feedback,undefined);assert.equal(response.books[0].googleUrl,'https://www.google.com/search?q=Book');assert.match(response.books[0].catalogUrl,/aslib.on.worldcat.org/);
 const external=publicReview('test-issue',{...staffIssue,books:[{...staffIssue.books[0],sourceUrl:'https://publisher.example/book'}]},null);assert.equal(external.books[0].sourceUrl,'https://publisher.example/book');
});

test('candidate tabs are unmistakably named and remain private staff metadata',()=>{const normalized=validateIssue(issue);assert.equal(normalized.researcherSheet,'AI candidates - '+issue.researcher);assert.equal(candidateSheetTitle('Example'),'AI candidates - Example');assert.equal('researcherSheet' in publicReview('id',normalized,null),false);assert.throws(()=>validateIssue({...issue,researcherSheet:issue.researcher}),/AI candidates/);});
