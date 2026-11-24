import test from 'node:test';
import assert from 'node:assert/strict';
import {invoke} from '../server/service.mjs';
const env={LIBRARY_MODE:'sites-bridge',LIBRARY_READER_TRANSPORT:'test-gateway',LIBRARY_TEST_GATEWAY_SECRET:'fixture',LIBRARY_TEST_GATEWAY_ORIGIN:'https://reader-placeholder.chatgpt.site'};
const reply=(records=[])=>({total:records.length,records,checkedAt:'2026-11-22T00:00:00Z',nextOffset:null});
test('article and host journal evidence remain separate and preserve worldwide scope',async()=>{
 const calls=[];const fetcher=async(_url,options)=>{const p=JSON.parse(options.body);calls.push(p.input);return Response.json(reply([{oclcNumber:String(calls.length),title:calls.length===1?'Article candidate':'Journal candidate',format:calls.length===1?'Article':'Journal',isbns:[]}]));};
 const d=await invoke('search_articles',{query:'Article title',issn:'1234-567X',scope:'worldcat'},env,fetcher);
 assert.deepEqual(calls.map(c=>[c.kind,c.scope]),[['title','worldcat'],['issn','worldcat']]);
 assert.equal(d.articleSearch.records[0].title,'Article candidate');assert.equal(d.hostJournalSearch.records[0].title,'Journal candidate');
 assert.equal(d.fullTextAccessVerified,false);assert.equal(d.issueCoverageVerified,false);assert.equal(d.articleIdentityVerified,false);
});
test('article lookup defaults to local scope and preserves evidence when journal lookup fails',async()=>{
 let calls=0;const d=await invoke('search_articles',{query:'Missing article',journalTitle:'Known journal'},env,async()=>++calls===1?Response.json(reply()):new Response('',{status:403}));
 assert.equal(d.scope,'library');assert.deepEqual(d.articleSearch.records,[]);assert.equal(d.hostJournalError.code,'permission_denied');assert.equal(d.coverageComplete,false);
});
test('general catalogue searches accept ISSN and retain non-book formats',async()=>{
 const d=await invoke('search_library_catalog',{query:'1234-567X',kind:'issn',scope:'worldcat'},env,async(_url,o)=>{const p=JSON.parse(o.body);assert.equal(p.input.kind,'issn');assert.equal(p.input.scope,'worldcat');return Response.json(reply([{oclcNumber:'10',title:'Journal',format:'Journal',isbns:[]}]));});
 assert.equal(d.records[0].format,'Journal');assert.equal(d.symbol,null);
 await assert.rejects(()=>invoke('search_articles',{query:'Title',issn:'invalid'},env),/Invalid/);
});
