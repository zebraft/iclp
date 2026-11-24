import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{tools,validate} from '../worker/index.js';
test('reader MCP exposes optional scope and preserves AS default',async()=>{
 assert.equal(validate('search_library_catalog',{query:'jazz'}).input.scope,'as');
 assert.equal(validate('search_library_catalog',{query:'jazz',kind:'keyword',scope:'worldcat'}).input.scope,'worldcat');
 assert.throws(()=>validate('search_library_catalog',{query:'jazz',scope:'all'}));
 const r=await worker.fetch(new Request('https://test/mcp',{method:'POST',body:JSON.stringify({id:1,method:'tools/list'})}),{});
 const d=await r.json();assert.deepEqual(d.result.tools[0].inputSchema.properties.scope.enum,['as','worldcat']);
 assert.equal(d.result.tools[0].inputSchema.properties.scope.default,'as');assert.equal(tools.length,2);
 assert.throws(()=>validate('create_recommendation_checklist',{}));
});
