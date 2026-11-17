const OAUTH='https://oauth2.googleapis.com/token';
const API='https://sheets.googleapis.com/v4/spreadsheets/';
const b64u=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const enc=s=>b64u(new TextEncoder().encode(s));
export function validateGoogleKey(raw){if(!raw||raw.type!=='service_account'||!/^[-\w.]+@[-\w.]+\.iam\.gserviceaccount\.com$/.test(raw.client_email)||typeof raw.private_key!=='string'||!raw.private_key.startsWith('-----BEGIN PRIVATE KEY-----')||raw.private_key.length>12000)throw Error('請上傳有效的 Google 服務帳戶 JSON / Upload a valid Google service-account JSON');return {email:raw.client_email,key:raw.private_key};}
import {sheetId} from './reconciliation.mjs';
export {sheetId,planReconciliation,writeResponse} from './reconciliation.mjs';
export async function googleClient(credentials,send=fetch){
 const now=Math.floor(Date.now()/1000),head=enc(JSON.stringify({alg:'RS256',typ:'JWT'})),claim=enc(JSON.stringify({iss:credentials.email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:OAUTH,iat:now,exp:now+3600}));
 const pem=credentials.key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(head+'.'+claim));
 const auth=await send(OAUTH,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+claim+'.'+b64u(new Uint8Array(signature))}).toString(),redirect:'manual',signal:AbortSignal.timeout(8000)});
 if(!auth.ok)throw Error('Google 授權失敗，請檢查服務帳戶設定 / Google authorization failed; check service-account settings');const token=(await auth.json()).access_token;if(!token)throw Error('Google 授權未完成 / Google authorization incomplete');
 return async(id,path='',body)=>{const r=await send(API+id+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(8000)});if(!r.ok){const e=new Error('Google 試算表寫入未完成 / Google Sheets operation incomplete');e.status=r.status;throw e;}return r.json();};
}
