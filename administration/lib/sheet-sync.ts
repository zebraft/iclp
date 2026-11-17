import {env} from 'cloudflare:workers';
import {getCredentials,saveCredentials,requireLibraryAdmin} from './credentials';
import {googleClient,validateGoogleKey,sheetId,writeResponse} from './google-sheets.mjs';
import {scriptCall,validateScriptUrl,verifyEnvelope} from './apps-script.mjs';
import {markSynced,ReviewError,candidateSheetTitle} from './recommendations.mjs';
const KEY='library:google-sheets';
function connection(c:any){if(c?.id?.startsWith('apps-script:'))return {provider:'apps-script',url:c.id.slice(12),...JSON.parse(c.secret)};return {provider:'service-account',email:c?.id,key:c?.secret};}
export async function assertDeliveryWorkbook(workbookUrl:string){const c=await getCredentials(KEY);if(c?.id?.startsWith('apps-script:')){const config=connection(c);if(sheetId(workbookUrl)!==sheetId(config.workbookUrl))throw new ReviewError('請使用固定薦購工作簿；先查 recommendation_delivery_status，不要另建每期工作簿 / Reuse the permanent staff workbook from recommendation_delivery_status; do not create a destination per booklist');}}
export async function googleStatus(){
 const c=await getCredentials(KEY);if(!c?.secret)return {configured:false,healthy:false,provider:null,serviceEmail:null,retryTriggerInstalled:false};
 const config=connection(c);let details:any={};
 try{if(config.provider==='apps-script')details=await scriptCall(config.url,config.secret,{action:'probe',workbookUrl:config.workbookUrl});else await googleClient(config);
 const heartbeat:any=await env.DB.prepare('SELECT expires_at FROM sheet_sync_lock WHERE id=?').bind('bridge-retry-heartbeat').first();
 return {configured:true,healthy:true,provider:config.provider,serviceEmail:config.email||null,retryTriggerInstalled:details.retryTriggerInstalled===true,lastRetryAt:heartbeat?.expires_at?new Date(heartbeat.expires_at).toISOString():null,workbookUrl:config.workbookUrl||null};
 }catch{return {configured:true,healthy:false,provider:config.provider,serviceEmail:config.email||null,retryTriggerInstalled:false,message:'Google 連線驗證失敗，回覆會保留待處理 / Google connection check failed; responses remain pending'};}
}
export async function configureGoogle(uid:string,raw:unknown,workbookUrl:string){await requireLibraryAdmin(uid);const c=validateGoogleKey(raw);const api=await googleClient(c);const id=sheetId(workbookUrl);await api(id);await api(id,':batchUpdate',{requests:[{findReplace:{find:'__iclp_setup_no_match__',replacement:'__iclp_setup_no_match__',allSheets:true}}]});await saveCredentials(KEY,c.email,c.key,uid);return {configured:true,healthy:true,provider:'service-account',serviceEmail:c.email};}
export async function configureAppsScript(uid:string,url:string,secret:string,workbookUrl:string){
 await requireLibraryAdmin(uid);validateScriptUrl(url);sheetId(workbookUrl);
 const probe=await scriptCall(url,secret,{action:'probe',workbookUrl});
 if(probe.spreadsheetId!==sheetId(workbookUrl)||!probe.retryTriggerInstalled)throw Error('Google 請先執行 Apps Script 的 setUp，再連接 / Run setUp in Apps Script before connecting');
 await saveCredentials(KEY,'apps-script:'+url,JSON.stringify({secret,workbookUrl}),uid);
 return {configured:true,healthy:true,provider:'apps-script',retryTriggerInstalled:true,workbookUrl};
}
export async function directSync(responseId:string){
 const db=env.DB;const row:any=await db.prepare('SELECT r.*,i.payload AS issue_payload,i.owner_id FROM recommendation_responses r JOIN recommendation_issues i ON r.issue_id=i.id WHERE r.id=?').bind(responseId).first();
 if(!row)return {synced:false,reason:'response_missing'};if(row.synced_at)return {synced:true};
 const creds=await getCredentials(KEY);if(!creds?.secret)return {synced:false,reason:'google_authorization_required'};
 const lease=crypto.randomUUID(),now=Date.now();const lock=await db.prepare('INSERT INTO sheet_sync_lock (id,lease,expires_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET lease=excluded.lease,expires_at=excluded.expires_at WHERE sheet_sync_lock.expires_at<?').bind('shared-workbook',lease,now+300000,now).run();if(!lock.meta.changes)return {synced:false,reason:'busy_retry'};
 try{
 // Check the latest revision after acquiring the lock, so stale workers cannot win.
 const latest:any=await db.prepare('SELECT id FROM recommendation_responses WHERE issue_id=? ORDER BY revision DESC LIMIT 1').bind(row.issue_id).first();if(latest?.id!==responseId)return {synced:false,reason:'superseded'};
 const snapshot=JSON.parse(row.issue_payload),issue={...snapshot,researcherSheet:snapshot.researcherSheet||candidateSheetTitle(snapshot.researcher)},response={id:row.id,revision:row.revision,submittedAt:row.submitted_at,...JSON.parse(row.payload)},config=connection(creds);let last:any;
 for(let attempt=0;attempt<2;attempt++){try{
 const receipt=config.provider==='apps-script'?await scriptCall(config.url,config.secret,{action:'sync',issue,response}):await writeResponse(await googleClient(config),issue,response);
 await markSynced(db,row.owner_id,responseId,receipt);return {synced:true,receipt};
 }catch(e){last=e;if(attempt===0)await new Promise(r=>setTimeout(r,500));}}
 return {synced:false,reason:'google_write_pending',message:last?.message?.startsWith('Google')?last.message:'試算表同步尚未完成，回覆已保留 / Workbook sync pending; response retained'};
 }finally{await db.prepare('DELETE FROM sheet_sync_lock WHERE id=? AND lease=?').bind('shared-workbook',lease).run();}
}
export async function retryPending(uid:string){await requireLibraryAdmin(uid);const rows=await env.DB.prepare('SELECT r.id FROM recommendation_responses r WHERE r.synced_at IS NULL AND r.revision=(SELECT MAX(x.revision) FROM recommendation_responses x WHERE x.issue_id=r.issue_id) ORDER BY r.submitted_at LIMIT 5').all();const results=[];for(const r of rows.results)results.push({id:r.id,...await directSync(String(r.id))});return results;}
export async function handleScheduledRetry(raw:unknown){
 const c=await getCredentials(KEY);if(!c?.ownerId||!c.id.startsWith('apps-script:'))throw Error('Not configured');
 const config=connection(c),payload=await verifyEnvelope(raw,config.secret);if(payload.action!=='retry')throw Error('Invalid action');
 const request=raw as {nonce:string};const now=Date.now();
 await env.DB.prepare("DELETE FROM sheet_sync_lock WHERE id LIKE 'bridge-nonce:%' AND expires_at<?").bind(now).run();
 const used=await env.DB.prepare('INSERT INTO sheet_sync_lock (id,lease,expires_at) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind('bridge-nonce:'+request.nonce,'used',now+600000).run();if(!used.meta.changes)throw Error('Replayed request');
 const results=await retryPending(c.ownerId);
 await env.DB.prepare('INSERT INTO sheet_sync_lock (id,lease,expires_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at').bind('bridge-retry-heartbeat','received',Date.now()).run();
 return {ok:true,attempted:results.length,synced:results.filter(r=>r.synced).length};
}
