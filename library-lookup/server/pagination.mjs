import {UserError} from './contracts.mjs';
// The service contract uses zero-based offsets. The retained upstream accepts
// record positions starting at one (0 is also treated as the first position).
export function upstreamOffset(offset=0){return offset+1;}
export function uniqueRecords(records){const seen=new Set();return records.filter(r=>{if(seen.has(r.oclcNumber))return false;seen.add(r.oclcNumber);return true;});}
export function bridgePage(data,offset=0){
 if(offset>=200)throw new UserError('pagination_limit','The bridge page limit was reached. Refine the query; more records may exist.');
 const records=uniqueRecords(data.records);
 const next=Number.isInteger(data.nextOffset)?data.nextOffset-1:null;
 return {records,nextOffset:next!==null&&next>offset&&next<200?next:null,truncated:offset+records.length<data.total};
}
