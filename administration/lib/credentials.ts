import { env } from 'cloudflare:workers';
import { getDb } from '../db';
import { credentials } from '../db/schema';
import { eq } from 'drizzle-orm';
const bytes = (s:string) => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const b64 = (b:Uint8Array) => btoa(String.fromCharCode(...b));
async function key() {
 const value=(env as unknown as Record<string,string>).CREDENTIAL_ENCRYPTION_KEY;
 if(!value || !/^[a-f0-9]{64}$/.test(value)) throw Error('加密設定未就緒 / Encryption configuration unavailable');
 return crypto.subtle.importKey('raw',Uint8Array.from(value.match(/../g)!,x=>parseInt(x,16)),'AES-GCM',false,['encrypt','decrypt']);
}
export async function getCredentials(userId:string) {
 const row=await getDb().select().from(credentials).where(eq(credentials.userId,userId)).get();
 if(!row) return null;
 const [iv,sealed]=row.sealed.split('.');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:new TextEncoder().encode(userId)},await key(),bytes(sealed));
 return JSON.parse(new TextDecoder().decode(plain)) as {id:string,secret:string,ownerId?:string};
}
export async function saveCredentials(userId:string,id:string,secret:string,ownerId?:string) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(userId)},await key(),new TextEncoder().encode(JSON.stringify({id,secret,...(ownerId?{ownerId}:{})})));
 const data={userId,sealed:b64(iv)+'.'+b64(new Uint8Array(sealed)),updatedAt:new Date().toISOString()};
 await getDb().insert(credentials).values(data).onConflictDoUpdate({target:credentials.userId,set:{sealed:data.sealed,updatedAt:data.updatedAt}});
}
export async function removeCredentials(userId:string) {await getDb().delete(credentials).where(eq(credentials.userId,userId));}

// One institutional credential, still AES-GCM encrypted; management stays with its owner.
const libraryKey='library:shared-credentials';
export async function getLibrarySettings() {
 let shared=await getCredentials(libraryKey);
 if(!shared) {
  // Promote only an unambiguous pre-existing credential. Never pick another user's
  // key from a multi-user store; an empty/ambiguous store fails closed.
  const rows=await getDb().select({userId:credentials.userId}).from(credentials).limit(2);
  if(rows.length!==1 || rows[0].userId===libraryKey) throw Error('OCLC 共用憑證需管理員設定 / Shared credentials need administrator setup');
  const ownerId=rows[0].userId;
  const previous=await getCredentials(ownerId);
  if(!previous) throw Error('OCLC 憑證未就緒 / Credentials unavailable');
  await saveCredentials(libraryKey,previous.id,previous.secret,ownerId);
  shared=await getCredentials(libraryKey);
 }
 if(!shared?.ownerId) throw Error('OCLC 管理員設定異常 / Invalid administrator configuration');
 return shared;
}
export async function getLibraryCredentials() {
 const shared=await getLibrarySettings();
 return shared.id && shared.secret ? shared : null;
}
export async function requireLibraryAdmin(userId:string) {
 const shared=await getLibrarySettings();
 if(shared.ownerId!==userId) throw Error('OCLC 僅管理員可變更機構憑證 / Only the administrator can change institutional credentials');
 return shared;
}
export async function saveLibraryCredentials(userId:string,id:string,secret:string) {
 await requireLibraryAdmin(userId);
 await saveCredentials(libraryKey,id,secret,userId);
}
export async function removeLibraryCredentials(userId:string) {
 await requireLibraryAdmin(userId);
 // Retain ownership and a tombstone so legacy credentials cannot be re-promoted.
 await saveCredentials(libraryKey,'','',userId);
}
