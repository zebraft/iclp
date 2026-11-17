import { getLibraryCredentials } from './credentials';
import { authenticate, transport, checkBook } from './worldcat.mjs';
import { z } from 'zod';
import { getDb } from '../db';
import { holdingsCache } from '../db/schema';
import { eq } from 'drizzle-orm';
import { cachedCheck,hashKey,mapLimit } from './holdings-cache.mjs';
const tokens=new Map<string,{token:string,expiresAt:number}>();
export const bookSchema=z.object({title:z.string().trim().min(2).max(500),isbn:z.string().trim().regex(/^(?:[0-9]{13}|[0-9]{9}[0-9Xx])$/).optional(),author:z.string().max(200).optional(),sourceListDate:z.string().max(100).optional(),source:z.string().max(300).optional()}).strict();
export async function checkBooks(userId:string,raw:unknown,options:{refresh?:boolean}={}) {
 if(!userId)throw Error('OCLC 請先登入 / Sign in required');
 const books=z.array(bookSchema).min(1).max(3).parse(raw);
 const refresh=z.boolean().optional().parse(options.refresh)||false;
 const c=await getLibraryCredentials();if(!c)throw Error('請先設定 OCLC 憑證 / Configure OCLC credentials first');
 const namespace=await hashKey(c.id+'|'+c.secret);
 const store={
  async get(key:string){const row=await getDb().select().from(holdingsCache).where(eq(holdingsCache.key,key)).get();return row&&row.expiresAt>Date.now()?JSON.parse(row.payload):null;},
  async set(key:string,entry:any){const payload=JSON.stringify(entry);if(payload.length>1000000)return;await getDb().insert(holdingsCache).values({key,payload,expiresAt:entry.expiresAt}).onConflictDoUpdate({target:holdingsCache.key,set:{payload,expiresAt:entry.expiresAt}});}
 };
 let tokenPromise:Promise<string>|undefined;
 const token=()=>tokenPromise??=(async()=>{const cached=tokens.get(namespace);if(cached&&cached.expiresAt>Date.now())return cached.token;const auth=await authenticate(c.id,c.secret);tokens.set(namespace,{token:auth.token,expiresAt:Date.now()+Math.max(0,Math.min(auth.expiresIn,3600)-60)*1000});return auth.token;})();
 const reports=await mapLimit(books,2,(book:any)=>cachedCheck(book,namespace,store,async(input:any)=>checkBook(input,transport(await token())),Date.now,refresh));
 return {scope:{symbol:'AAE',allASCoverageVerified:false,orderStatusVerified:false},reports};
}
export function safeError(e:unknown) {
 if(e instanceof z.ZodError)return '輸入格式不符 / Invalid input';
 const m=e instanceof Error?e.message:'';
 return /^(OCLC|請先設定|加密設定)/.test(m)?m:'處理未完成，請重試 / Request incomplete; retry';
}
export function userId(req:Request){const id=req.headers.get('oai-authenticated-user-id');if(!id)throw Error('未登入 / Sign in required');return id;}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw Error('來源驗證失敗 / Origin check failed');}
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
