import { checkBooks,userId,sameOrigin,json,safeError } from '../../../lib/service';
export async function POST(req:Request){try{const id=userId(req);sameOrigin(req);const body=await req.json() as {books?:unknown,refresh?:boolean};return json(await checkBooks(id,body.books,{refresh:body.refresh}));}catch(e){return json({error:safeError(e)},400);}}
