import test from 'node:test';
import assert from 'node:assert/strict';
import {createCache} from '../server/lookup-cache.mjs';
import {invoke} from '../server/service.mjs';
import {createProvider} from '../server/provider.mjs';
import {createSitesProvider} from '../server/sites-provider.mjs';
import {tools,validate} from '../server/contracts.mjs';
const bridge={LIBRARY_READER_SECRET:'fixture-secret',LIBRARY_BACKEND_ACCESS:'fixture-access',LIBRARY_BACKEND_ORIGIN:'https://backend-placeholder.chatgpt.site'};
const live={LIBRARY_MODE:'oclc',LIBRARY_SYMBOL:'TEST',OCLC_CLIENT_ID:'fixture-client',OCLC_CLIENT_SECRET:'fixture-secret'};
const book=id=>({oclcNumber:String(id),title:'Example '+id,isbns:[]});
const page=(ids=['1'])=>({checkedAt:'2026-01-01T00:00:00Z',total:ids.length,records:ids.map(book),nextOffset:null});
test('result cache expires, refreshes, isolates mutations and never caches failures',async()=>{
 let clock=0,n=0;const c=createCache({now:()=>clock}),load=async()=>({n:++n});
 assert.equal((await c.get('x',load,{ttl:10})).hit,false);
 const hit=await c.get('x',load);assert.equal(hit.hit,true);hit.value.n=99;
 assert.equal((await c.get('x',load)).value.n,1);
 clock=11;assert.equal((await c.get('x',load)).value.n,2);
 assert.equal((await c.get('x',load,{refresh:true})).value.n,3);
 let failures=0;for(let i=0;i<2;i++)await assert.rejects(()=>c.get('fail',()=>{failures++;throw Error('failed');}));assert.equal(failures,2);
});
test('concurrent reads share work but a refresh cannot be overwritten by older work',async()=>{
 const c=createCache();let release;const old=c.get('x',()=>new Promise(r=>{release=r;}));
 const joined=c.get('x',()=>{throw Error('duplicate request');});
 const fresh=await c.get('x',async()=>({version:2}),{refresh:true});
 release({version:1});assert.equal((await old).value.version,1);assert.equal((await joined).hit,true);
 assert.equal((await c.get('x',()=>{throw Error('cache lost');})).value.version,fresh.value.version);
});
test('cache bounds entry count and total UTF-8 bytes',async()=>{
 const c=createCache({maxEntries:2,maxBytes:40});let n=0;
 for(let i=0;i<2;i++)await c.get('large',async()=>({text:'漢'.repeat(20),n:++n}));assert.equal(n,2);
 await c.get('a',async()=>({n:1}));await c.get('b',async()=>({n:2}));await c.get('c',async()=>({n:3}));
 assert.equal((await c.get('a',async()=>({n:4}))).hit,false);
});
test('search can return two locations in one call and retains partial errors',async()=>{
 const calls=[],fetcher=async(_url,options)=>{const d=JSON.parse(options.body);calls.push(d);
  if(d.action==='search')return Response.json(page(['1','2']));
  if(d.oclcNumber==='2')return new Response('private upstream error',{status:403});
  return Response.json({detailSupported:true,holdings:[{holdingLocation:'SYSTEM',sublocationCollection:'MAIN',displayCallNumber:'A 1'}]});
 };
 const d=await invoke('search_library_catalog',{query:'Example',includeLocations:true,locationLimit:2},bridge,fetcher);
 assert.equal(calls.length,3);assert.equal(d.records.length,2);assert.equal(d.locationResults[0].holdings[0].callNumber,'A 1');
 assert.equal(d.locationResults[1].error.code,'permission_denied');assert.equal(d.locationsTruncated,false);assert.ok(!JSON.stringify(d).includes('private upstream error'));
 const again=await invoke('get_library_locations',{oclcNumber:'1'},bridge,fetcher);assert.equal(again.cache.hit,true);assert.equal(calls.length,3);
});
test('search-only calls do not fetch locations; repeat calls reuse dated results and refresh bypasses them',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json(page());};
 const first=await invoke('search_library_catalog',{query:'Example'},bridge,fetcher);
 const second=await invoke('search_library_catalog',{query:'Example'},bridge,fetcher);
 assert.equal(calls,1);assert.equal(first.cache.hit,false);assert.equal(second.cache.hit,true);assert.equal(second.checkedAt,first.checkedAt);assert.equal(second.cache.originalCheckedAt,first.checkedAt);
 await invoke('search_library_catalog',{query:'Example',refresh:true},bridge,fetcher);assert.equal(calls,2);
 await invoke('search_library_catalog',{query:'Example',scope:'worldcat'},bridge,fetcher);assert.equal(calls,3);
 await invoke('search_library_catalog',{query:'Example'},{...bridge,LIBRARY_BACKEND_ACCESS:'different-fixture-access'},fetcher);assert.equal(calls,4);
});
test('cache hits do not bypass configuration or public-authorization checks',async()=>{
 const fetcher=async()=>Response.json(page());
 await invoke('search_library_catalog',{query:'Example'},bridge,fetcher);
 await assert.rejects(()=>invoke('search_library_catalog',{query:'Example'},{...bridge,LIBRARY_SYMBOL:'OTHER'},fetcher),/DEMO only/);
 await assert.rejects(()=>invoke('search_library_catalog',{query:'Example'},{...bridge,RELEASE_CHANNEL:'public'},fetcher),/not been authorized/);
});
test('unavailable locations are not cached as evidence of absence',async()=>{
 let n=0;const fetcher=async()=>{n++;return Response.json({detailSupported:false});};
 await invoke('get_library_locations',{oclcNumber:'1'},bridge,fetcher);await invoke('get_library_locations',{oclcNumber:'1'},bridge,fetcher);assert.equal(n,2);
});
test('the bridge converts zero-based page offsets without repeated boundary records',async()=>{
 const positions=[],fetcher=async(_url,options)=>{const d=JSON.parse(options.body),start=d.input.offset;positions.push(start);
  return Response.json({total:25,records:Array.from({length:10},(_,i)=>book(start+i)),nextOffset:start+10});
 };
 const p=createSitesProvider(bridge,fetcher),a=await p.search({query:'Example',offset:0}),b=await p.search({query:'Example',offset:a.nextOffset});
 assert.deepEqual(positions,[1,11]);assert.equal(a.nextOffset,10);assert.equal(b.nextOffset,20);
 assert.equal(a.records.some(r=>b.records.some(s=>s.oclcNumber===r.oclcNumber)),false);
 await assert.rejects(()=>p.search({query:'Example',offset:200}),e=>e.code==='pagination_limit');assert.equal(positions.length,2);
});
test('direct OCLC queries use one-based record positions and reuse normal/detail tokens separately',async()=>{
 const positions=[],scopes=[];const fetcher=async(url,options)=>{
  if(String(url).endsWith('/token')){scopes.push(options.body.get('scope'));return Response.json({access_token:'fixture-token',expires_in:3600});}
  const u=new URL(url);
  if(u.pathname.endsWith('bibs-detailed-holdings'))return Response.json({detailedHoldings:[]});
  const start=Number(u.searchParams.get('offset'));positions.push(start);
  return Response.json({numberOfRecords:25,briefRecords:Array.from({length:10},(_,i)=>({...book(start+i),creator:'Example author',specificFormat:'PrintBook'}))});
 };
 const p=createProvider(live,fetcher),a=await p.search({query:'Example'}),b=await p.search({query:'Example',offset:a.nextOffset});
 assert.deepEqual(positions,[1,11]);assert.equal(a.nextOffset,10);assert.equal(b.records[0].oclcNumber,'11');
 await invoke('get_library_locations',{oclcNumber:'1',refresh:true},live,fetcher);await invoke('get_library_locations',{oclcNumber:'1',refresh:true},live,fetcher);
 assert.equal(scopes.filter(s=>s==='wcapi:view_holdings').length,1);assert.equal(scopes.length,2);
});
test('new switches validate booleans and bound location fanout',()=>{
 const s=tools.find(t=>t.name==='search_library_catalog').inputSchema;
 assert.throws(()=>validate({query:'Example',includeLocations:'yes'},s));
 assert.throws(()=>validate({query:'Example',includeLocations:true,locationLimit:3},s));
 validate({query:'Example',includeLocations:true,locationLimit:2,refresh:true},s);
});
