import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkBook,parsePage,titleVariants,authenticate,transport} from '../lib/worldcat.mjs';
test('Zero, malformed, HTTP and identity safeguards',()=>{
 assert.equal(parsePage({http:200,data:{numberOfRecords:0}}).ok,true);
 for(const r of [{http:403},{http:503},{http:200,data:{numberOfRecords:1}},{http:200,data:{numberOfRecords:0,briefRecords:null}},{http:200,data:{numberOfRecords:1,briefRecords:[null]}},{http:200,data:{briefRecords:[]}}])assert.equal(parsePage(r).ok,false);
});
test('Japanese series/edition and Western subtitle variants',()=>{
 assert.ok(titleVariants('杜甫と安史の乱 アジア遊学324').includes('杜甫と安史の乱'));
 assert.ok(titleVariants('増補改訂版 数と易の中国思想史').includes('数と易の中国思想史'));
 assert.ok(titleVariants('中国近現代史 清朝末期から21世紀の強国化まで （中公新書）').includes('中国近現代史 清朝末期から21世紀の強国化まで'));
 assert.ok(titleVariants('[Strittigkeit Der Bilder, Bande 1-3]').includes('Strittigkeit Der Bilder, Bande 1-3'));
 assert.ok(titleVariants('Theatermania in Eighteenth-Century Europe : Subtitle').includes('Theatermania in Eighteenth-Century Europe'));
});
test('Authentication errors never expose provider response or credentials',async()=>{
 await assert.rejects(()=>authenticate('test-id','test-secret',async()=>new Response('test-secret',{status:401})),e=>!e.message.includes('test-secret')&&e.message.includes('401'));
 await assert.rejects(()=>authenticate('x','y',async()=>new Response('not-json')),/Invalid authentication/);
});
test('API failure stays uncertain',async()=>{
 const r=await checkBook({title:'Some book',isbn:'9781399564632'},async()=>({http:503}));assert.equal(r.incomplete,true);assert.equal(r.outcome,'uncertain');assert.equal(r.purchaseReady,false);
});
