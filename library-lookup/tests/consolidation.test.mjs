import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invoke} from '../server/service.mjs';
import {dispatch,instructions} from '../server/rpc.mjs';
import {checkFiniteList} from '../server/list-workflow.mjs';
import {legacyReader} from '../server/established.mjs';
import established from '../server/established.mjs';
import {assessSerialCoverage} from '../server/serial-coverage.mjs';
const env={LIBRARY_READER_SECRET:'fixture-secret',LIBRARY_BACKEND_ACCESS:'fixture-access',LIBRARY_BACKEND_ORIGIN:'https://backend-placeholder.chatgpt.site'};
const page=records=>({total:records.length,records,nextOffset:null,checkedAt:'2026-11-23T00:00:00Z'});
const record={oclcNumber:'123',title:'Ritual history',edition:'Second edition',format:'Digital',isbns:['9780306406157'],year:'2024'};

test('legacy as and canonical library use the same scoped implementation, with no status preflight',async()=>{
 const calls=[];const fetcher=async(_u,o)=>{calls.push(JSON.parse(o.body).input);return Response.json(page([record]));};
 for(const scope of ['as','library']){const d=await invoke('search_library_catalog',{query:'123',kind:'oclc',scope},env,fetcher);assert.equal(d.scope,'library');assert.equal(d.symbol,'DEMO');assert.equal(d.records[0].edition,'Second edition');}
 assert.equal(calls.length,1);assert.ok(calls.every(c=>c.scope==='as'&&c.kind==='oclc'));
});
test('topic discovery retains recent and foundational records without a material restriction',async()=>{
 const rows=[record,{...record,oclcNumber:'124',title:'Foundational essays',year:'1950',format:'PrintBook'},{...record,oclcNumber:'125',title:'Research journal',format:'Journal'}];
 const d=await invoke('search_library_catalog',{query:'ritual history',kind:'keyword'},env,async(_u,o)=>{const p=JSON.parse(o.body);assert.equal(p.input.kind,'keyword');return Response.json(page(rows));});
 assert.deepEqual(d.records.map(r=>r.year),['2024','1950','2024']);assert.deepEqual(d.records.map(r=>r.format),['Digital','PrintBook','Journal']);
});
test('worldwide pagination preserves scope without an ownership claim',async()=>{
 const d=await invoke('search_library_catalog',{query:'history',kind:'keyword',scope:'worldcat',offset:10},env,async(_u,o)=>{const p=JSON.parse(o.body);assert.equal(p.input.scope,'worldcat');assert.equal(p.input.offset,11);return Response.json({total:30,records:[record],nextOffset:21});});
 assert.equal(d.scope,'worldcat');assert.equal(d.symbol,null);assert.equal(d.nextOffset,20);
});
test('matching identifiers retain explicit edition, format, volume and year warnings',async()=>{
 const d=await invoke('check_holdings',{books:[{id:'a',title:'Ritual history',isbn:'9780306406157',edition:'First edition',format:'PrintBook',year:'2000',volume:'2'}]},env,async()=>Response.json(page([record])));
 const r=d.results[0];assert.equal(r.identityVerified,false);assert.equal(r.outcome,'holding_found_identity_review');
 for(const reason of ['edition_differs_or_not_confirmed','format_differs_or_not_confirmed','year_differs_or_not_confirmed','volume_requires_holdings_review'])assert.ok(r.identityWarnings.some(w=>w.reason===reason));
 const csv=await invoke('export_selection',{books:[r.book],selectedIds:['a']},env);assert.ok(csv.csv.includes('First edition'));assert.ok(csv.csv.includes('PrintBook'));
});
test('two branch locations remain separate including configured branch code and exact shelf marks',async()=>{
 const d=await invoke('get_library_locations',{oclcNumber:'123'},env,async()=>Response.json({detailSupported:true,holdings:[{holdingLocation:'DEMO',sublocationCollection:'MAIN',displayCallNumber:'A 1/2',shelvingLocation:'Shelf I'},{holdingLocation:'DEMO',sublocationCollection:'OTHER',displayCallNumber:'B 2',shelvingLocation:'Shelf II'}]}));
 assert.deepEqual(d.holdings.map(h=>[h.collection,h.callNumber]),[['MAIN','A 1/2'],['OTHER','B 2']]);assert.equal(Object.hasOwn(d,'availability'),false);
});
test('serial year evidence distinguishes inside, outside and unparsed statements without article-access claims',async()=>{
 const holdings=[{branchCode:'DEMO',collection:'MAIN',statements:[{text:'v.1-5 (2000-2004)'}]}];
 assert.equal(assessSerialCoverage(holdings,2002).yearEvidence,'within_reported_range');assert.equal(assessSerialCoverage(holdings,2010).yearEvidence,'outside_parsed_ranges');
 const unparsed=assessSerialCoverage([{statements:[{text:'v.5-; gaps'}]}],2010);assert.equal(unparsed.yearEvidence,'unparsed');
 const d=await invoke('get_library_locations',{oclcNumber:'123',citationYear:2002},env,async()=>Response.json({detailSupported:true,holdings:[{holdingParts:[{textualHoldings:'2000-2004'}]}]}));
 assert.equal(d.serialCoverage.yearEvidence,'within_reported_range');assert.equal(d.serialCoverage.issueCoverageVerified,false);assert.equal(d.serialCoverage.fullTextAccessVerified,false);
});
test('seven requested records complete three bounded batches and preserve failed/remaining ledger',async()=>{
 const books=Array.from({length:7},(_,i)=>({id:'id-'+i,title:i===4?'Failure':'Ritual history'}));let calls=0;
 const d=await checkFiniteList(books,(name,args)=>{calls++;assert.ok(args.books.length<=3);return invoke(name,args,env,async(_u,o)=>JSON.parse(o.body).input.query==='Failure'?new Response('',{status:403}):Response.json(page([record])));});
 assert.equal(calls,3);assert.equal(d.total,7);assert.equal(d.checked,6);assert.deepEqual(d.failedIds,['id-4']);assert.deepEqual(d.remainingIds,[]);assert.deepEqual(d.results.map(r=>r.book.id),books.map(b=>b.id));assert.equal(d.allAttempted,true);assert.equal(d.allVerified,false);
});
test('a failed whole batch does not prevent subsequent finite-list completion',async()=>{
 const books=Array.from({length:7},(_,i)=>({id:'i'+i,title:'Test'}));let batch=0;
 const d=await checkFiniteList(books,async(name,args)=>{if(++batch===2)throw Error('down');return invoke(name,args,{LIBRARY_MODE:'sample'});});
 assert.equal(batch,3);assert.deepEqual(d.failedIds,['i3','i4','i5']);assert.equal(d.results.length,7);
});
test('finite-list validation isolates invalid ISBN and rejects duplicate IDs before service calls',async()=>{
 let calls=0;const books=[{id:'a',title:'Good'},{id:'b',title:'Bad',isbn:'123'}];
 const d=await checkFiniteList(books,(n,a)=>{calls++;assert.deepEqual(a.books.map(b=>b.id),['a']);return invoke(n,a,{LIBRARY_MODE:'sample'});});
 assert.equal(calls,1);assert.deepEqual(d.failedIds,['b']);await assert.rejects(()=>checkFiniteList([books[0],books[0]],()=>{throw Error('must not run');}),/unique/);
});
test('finite-list executor detects omitted results instead of silently losing records',async()=>{
 const d=await checkFiniteList([{id:'a',title:'A'},{id:'b',title:'B'}],async()=>({results:[]}));assert.deepEqual(d.failedIds,['a','b']);assert.equal(d.results.length,2);
});
test('legacy gateway still returns raw wire fields and cannot select staff actions',async()=>{
 const raw={detailSupported:true,holdings:[{holdingLocation:'DEMO',sublocationCollection:'MAIN',displayCallNumber:'A 1'}]};
 const d=await legacyReader(new Request('https://reader-placeholder.chatgpt.site/'),env,'get_library_locations',{oclcNumber:'123'},async()=>Response.json(raw));assert.deepEqual(d,raw);
 await assert.rejects(()=>legacyReader(null,env,'send_email',{}),/Unsupported/);
 await assert.rejects(()=>legacyReader(null,{...env,LIBRARY_READER_TRANSPORT:'test-gateway'},'get_library_locations',{oclcNumber:'123'}),/direct upstream/);
});
test('established endpoint exposes the same tools while preserving its landing page and transport flags',async()=>{
 const homepage=await established.fetch(new Request('https://reader-placeholder.chatgpt.site/'),{});assert.ok((await homepage.text()).includes('Library Lookup'));
 const req=new Request('https://reader-placeholder.chatgpt.site/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});const d=await (await established.fetch(req,{})).json();assert.equal(d.result.tools.length,7);
 assert.equal((await established.fetch(new Request('https://reader-placeholder.chatgpt.site/public-mcp'),{})).status,404);
 assert.equal((await established.fetch(new Request('https://reader-placeholder.chatgpt.site/api/tools',{method:'POST'}),{})).status,404);
});
test('short runtime and focused skills retain behavioral safeguards without preflight or batch-permission instructions',()=>{
 assert.ok(instructions.split(/\s+/).length<100);
 for(const skill of ['library-holdings','book-selection']){
  const text=readFileSync(new URL('../plugin/skills/'+skill+'/SKILL.md',import.meta.url),'utf8');assert.ok(text.split(/\s+/).length<400);assert.match(text,/explicit instructions override/);assert.match(text,/recent research/);assert.match(text,/foundational/);assert.match(text,/general web only when requested/);assert.match(text,/finite/);assert.match(text,/fail/);
 }
 const h=readFileSync(new URL('../plugin/skills/library-holdings/SKILL.md',import.meta.url),'utf8');assert.match(h,/without asking permission between batches/);assert.match(h,/journal holding/);assert.match(h,/service failure/);
});
test('finite lists defer remaining IDs after quota exhaustion without repeated service calls',async()=>{
 const books=Array.from({length:7},(_,i)=>({id:'i'+i,title:'Test'}));let calls=0;
 const d=await checkFiniteList(books,async()=>{calls++;throw Object.assign(Error('quota'),{code:'provider_quota'});});
 assert.equal(calls,1);assert.deepEqual(d.failedIds,['i0','i1','i2']);assert.deepEqual(d.remainingIds,['i3','i4','i5','i6']);assert.equal(d.allAttempted,false);assert.equal(d.results.length,7);assert.equal(d.checked,0);
});
