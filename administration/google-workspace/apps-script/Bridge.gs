// Run setUp once from Extensions > Apps Script in the staff workbook.
// No service account. No emails or purchases. Keep this project private.
const RETRY_URL='https://checklist.example.invalid/api/delivery/retry';
function setUp(){
 const sheet=SpreadsheetApp.getActiveSpreadsheet();
 if(!sheet)throw new Error('請從共用試算表的「擴充功能 → Apps Script」開啟 / Open Apps Script from the staff workbook');
 const props=PropertiesService.getScriptProperties();
 if(!props.getProperty('WORKBOOK_ID'))props.setProperty('WORKBOOK_ID',sheet.getId());
 if(props.getProperty('WORKBOOK_ID')!==sheet.getId())throw new Error('Workbook mismatch');
 if(!props.getProperty('CONNECTION_SECRET'))props.setProperty('CONNECTION_SECRET',(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''));
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='retryDeliveries'))ScriptApp.newTrigger('retryDeliveries').timeBased().everyMinutes(5).create();
 showConnection();
}
function showConnection(){
 const code=PropertiesService.getScriptProperties().getProperty('CONNECTION_SECRET');
 if(!code)throw new Error('Run setUp first');
 SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput('<p>將連線碼貼至圖書館設定頁；勿貼到聊天。<br>Paste this code into the library setup page, not chat.</p><input type="password" readonly style="width:100%" value="'+code+'"><button onclick="const x=document.querySelector(\'input\');x.type=\'text\';x.select();document.execCommand(\'copy\')">顯示並複製 / Show and copy</button>'),'試算表連線 / Workbook connection');
}
function signRequest_(payload){
 const timestamp=Date.now(),nonce=Utilities.getUuid(),text=JSON.stringify(payload),secret=PropertiesService.getScriptProperties().getProperty('CONNECTION_SECRET');
 const signature=Utilities.computeHmacSha256Signature(timestamp+'\n'+nonce+'\n'+text,secret,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
 return {timestamp,nonce,payload:text,signature};
}
function verifyRequest_(raw,secret){
 if(!raw||!Number.isSafeInteger(raw.timestamp)||Math.abs(Date.now()-raw.timestamp)>300000||typeof raw.nonce!=='string'||!/^[-a-z0-9]{36}$/.test(raw.nonce)||typeof raw.payload!=='string'||raw.payload.length>1000000||!/^[a-f0-9]{64}$/.test(raw.signature||''))throw new Error('unauthorized');
 const expected=Utilities.computeHmacSha256Signature(raw.timestamp+'\n'+raw.nonce+'\n'+raw.payload,secret,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
 let difference=0;for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^raw.signature.charCodeAt(i);if(difference)throw new Error('unauthorized');
 const cache=CacheService.getScriptCache();if(cache.get('nonce:'+raw.nonce))throw new Error('replayed');cache.put('nonce:'+raw.nonce,'1',600);
 return JSON.parse(raw.payload);
}
function sheetsApi_(id,path,body){
 if(id!==PropertiesService.getScriptProperties().getProperty('WORKBOOK_ID'))throw new Error('workbook_mismatch');
 if(path.startsWith('?fields='))return Sheets.Spreadsheets.get(id,{fields:decodeURIComponent(path.slice(8))});
 if(path===':batchUpdate')return Sheets.Spreadsheets.batchUpdate(body,id);
 if(path.startsWith('/values:batchGet?'))return Sheets.Spreadsheets.Values.batchGet(id,{ranges:path.split('?')[1].split('&').filter(s=>s.startsWith('ranges=')).map(s=>decodeURIComponent(s.slice(7)))});
 throw new Error('invalid_operation');
}
function doPost(e){
 let lock;
 try{
  if(!e?.postData?.contents||e.postData.contents.length>1100000)throw new Error('invalid_request');
  const props=PropertiesService.getScriptProperties(),secret=props.getProperty('CONNECTION_SECRET');if(!secret)throw new Error('setup_required');
  // Script lock covers authorization/replay checks and the complete read-write-readback.
  lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw new Error('busy');
  const request=verifyRequest_(JSON.parse(e.postData.contents),secret),id=props.getProperty('WORKBOOK_ID');
  let result;
  if(request.action==='probe'){
   if(sheetId(request.workbookUrl)!==id)throw new Error('workbook_mismatch');
   const metadata=sheetsApi_(id,'?fields=spreadsheetId,properties(title)');
   sheetsApi_(id,':batchUpdate',{requests:[{findReplace:{find:'__iclp_connection_probe_no_match__',replacement:'__iclp_connection_probe_no_match__',allSheets:true}}]});
   result={spreadsheetId:metadata.spreadsheetId,title:metadata.properties.title,retryTriggerInstalled:ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='retryDeliveries')};
  }else if(request.action==='sync'){
   if(sheetId(request.issue.workbookUrl)!==id)throw new Error('workbook_mismatch');
   const steps=reconciliation(request.issue,request.response);let step=steps.next();while(!step.done)step=steps.next(sheetsApi_(...step.value));result=step.value;
  }else throw new Error('invalid_action');
  return jsonOutput_({ok:true,result});
 }catch(error){const allowed=['busy','unauthorized','replayed','workbook_mismatch','setup_required'];return jsonOutput_({ok:false,error:allowed.includes(error.message)?error.message:'sync_failed'});}
 finally{if(lock?.hasLock())lock.releaseLock();}
}
function jsonOutput_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function retryDeliveries(){
 const url=PropertiesService.getScriptProperties().getProperty('RETRY_URL')||RETRY_URL;
 if(!/^https:\/\//.test(url))throw new Error('Invalid retry URL');
 const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify(signRequest_({action:'retry'})),followRedirects:false,muteHttpExceptions:true});
 if(response.getResponseCode()!==200)throw new Error('圖書館連線尚未完成或重試失敗 / Library connection incomplete or retry failed');
}
