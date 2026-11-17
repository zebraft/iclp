import {handleScheduledRetry} from '../../../../lib/sheet-sync';
import {json} from '../../../../lib/service';
// The public frontend forwards this single signed operation to the private backend.
export async function POST(req:Request){try{const text=await req.text();if(text.length>10000)return json({error:'Request too large'},413);return json(await handleScheduledRetry(JSON.parse(text)));}catch{return json({error:'Retry authorization or delivery failed'},403);}}
