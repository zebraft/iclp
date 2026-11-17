const encode=s=>new TextEncoder().encode(s);
export function validateScriptUrl(value){
 if(typeof value!=='string'||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value))throw Error('Google 請貼上 Apps Script 的 /exec 網址 / Paste the Apps Script /exec deployment URL');
 return value;
}
export async function signedEnvelope(payload,secret,now=Date.now()){
 const text=JSON.stringify(payload),timestamp=now,nonce=crypto.randomUUID();
 const key=await crypto.subtle.importKey('raw',encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,encode(timestamp+'\n'+nonce+'\n'+text));
 return {timestamp,nonce,payload:text,signature:Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')};
}
export async function verifyEnvelope(raw,secret,now=Date.now()){
 if(!raw||!Number.isSafeInteger(raw.timestamp)||Math.abs(now-raw.timestamp)>300000||typeof raw.nonce!=='string'||!/^[-a-z0-9]{36}$/.test(raw.nonce)||typeof raw.payload!=='string'||raw.payload.length>1000000||typeof raw.signature!=='string'||!/^[a-f0-9]{64}$/.test(raw.signature))throw Error('Invalid signed request');
 const key=await crypto.subtle.importKey('raw',encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(raw.signature.match(/../g),b=>parseInt(b,16)),encode(raw.timestamp+'\n'+raw.nonce+'\n'+raw.payload)))throw Error('Invalid signed request');
 return JSON.parse(raw.payload);
}
export async function scriptCall(url,secret,payload,send=fetch){
 validateScriptUrl(url);if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw Error('Google 連線碼格式不符 / Invalid Apps Script connection code');
 let r=await send(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(await signedEnvelope(payload,secret)),redirect:'manual',signal:AbortSignal.timeout(60000)});
 // Apps Script serves ContentService output via one Google-owned redirect.
 if(r.status===302||r.status===303){const target=new URL(r.headers.get('location')||'',url);if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com')throw Error('Google 部署需允許網頁應用程式存取 / Check Apps Script web-app access');r=await send(target.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(60000)});}
 if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Google Apps Script 連線未完成，請檢查部署權限 / Check Apps Script deployment and access');
 const result=await r.json();if(result.ok!==true)throw Error('Google '+(result.error==='workbook_mismatch'?'試算表不符 / Workbook mismatch':result.error==='busy'?'同步忙碌，回覆保留待重試 / Delivery busy; saved for retry':'同步未完成，請檢查 Apps Script 設定 / Sync incomplete; check Apps Script setup'));
 return result.result;
}
