import {bookSchema,validate,normalizeBooks,UserError} from './contracts.mjs';
// Shared finite-list executor for scripts and reproducible workflow verification.
// call is the existing tool invocation interface; no accounts or state are stored.
export async function checkFiniteList(books,call){
 if(!Array.isArray(books)||!books.length||books.length>300)throw new UserError('invalid_input','Supply 1–300 records per finite-list job.');
 const ids=new Set();for(const b of books){if(!b?.id||ids.has(b.id))throw new UserError('duplicate_id','Every record needs a unique original ID.');ids.add(b.id);}
 const results=[];let batchCalls=0,deferred=false;
 for(let offset=0;offset<books.length;offset+=3){
  const valid=[];
  for(const b of books.slice(offset,offset+3)){
   try{validate(b,bookSchema);normalizeBooks([b]);valid.push(b);}catch(e){results.push({book:{id:b.id,title:b.title},outcome:'unable_to_verify',error:{code:e.code,message:e.message}});}
  }
  if(!valid.length)continue;
  try{
   batchCalls++;const reply=await call('check_holdings',{books:valid});
   if(!Array.isArray(reply?.results)||reply.results.length!==valid.length||new Set(reply.results.map(r=>r.book?.id)).size!==valid.length||valid.some(b=>!reply.results.some(r=>r.book?.id===b.id)))throw new UserError('provider_response','Batch response omitted or duplicated an original ID.');
   results.push(...reply.results);
   if(reply.results.some(r=>r.error?.code==='provider_quota'))deferred=true;
  }catch(e){for(const b of valid)results.push({book:b,outcome:'unable_to_verify',error:{code:e.code||'service_failure',message:'Batch did not complete.'}});if(e.code==='provider_quota')deferred=true;}
  if(deferred)break;
 }
 const byId=new Map(results.map(r=>[r.book.id,r]));const remainingIds=books.filter(b=>!byId.has(b.id)).map(b=>b.id);
 const ordered=books.map(b=>byId.get(b.id)||{book:b,outcome:'not_checked',reason:'quota_deferred'});
 const failedIds=ordered.filter(r=>r.outcome==='unable_to_verify').map(r=>r.book.id);
 return {results:ordered,total:books.length,checked:books.length-failedIds.length-remainingIds.length,failedIds,remainingIds,batchCalls,allAttempted:remainingIds.length===0,allVerified:failedIds.length===0&&remainingIds.length===0};
}
