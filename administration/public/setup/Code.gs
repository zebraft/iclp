// Generated from the shared reconciliation engine. Do not edit this copy.
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

function sheetId(url){const m=/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:\/|$)/.exec(url);if(!m)throw Error('試算表連結無效 / Invalid spreadsheet URL');return m[1];}
const val=s=>({userEnteredValue:{stringValue:String(s??'')}});
const trim=s=>String(s??'').replace(/-亞勃克#$/,'');
const append=(s,x)=>[...new Set(String(s||'').split('; ').concat(x).filter(Boolean))].join('; ');
function planReconciliation(issue,response,data){
 const blocks=data.valueRanges||[], get=name=>blocks.find(b=>b.range.startsWith("'"+name.replace(/'/g,"''")+"'!")||b.range.startsWith(name+'!'))?.values||[];
 const queue=get('採購清單 Buyer queue'),replies=get('回覆記錄 Replies'),research=get(issue.researcherSheet||issue.researcher);
 if(queue[0]?.[0]!=='書籍 ID / Book ID'||replies[0]?.[0]!=='回覆 ID / Reply ID'||research[0]?.[0]!=='書籍 ID / Book ID')throw Error('工作表格式不符，保留待處理 / Workbook schema differs; response retained');
 if(replies.slice(1).some(r=>r[0]===response.id))return {alreadyRecorded:true,requests:[],queueRows:queue.length};
 const byId=new Map();for(const [i,r] of queue.slice(1).entries()){if(!r[0])continue;if(byId.has(r[0]))throw Error('採購清單有重複書籍 ID，請覆核 / Duplicate buyer IDs require review');byId.set(r[0],{row:r.slice(),index:i+1});}const rows=[];
 const time=new Date(Date.parse(response.submittedAt)+8*3600000).toISOString().replace('Z','+08:00');const selected=new Set(response.selectedBookIds),updates=[];
 for(const b of issue.books){const source=research[b.sheetRow-1];if(!source||source[0]!==b.bookId||source[1]!==b.title)throw Error('原書目與期別編號不符 / Source and issue mapping differ');
 const note=String(source[17]||'')+'\n網頁回覆 / Web response '+response.id+' v'+response.revision+': '+(selected.has(b.bookId)?'已推薦 / Recommended':'本次未勾選 / Not selected this submission');updates.push({updateCells:{start:{sheetId:issue.researcherSheetId||2001,rowIndex:b.sheetRow-1,columnIndex:17},rows:[{values:[val(note)]}],fields:'userEnteredValue'}});
 if(!selected.has(b.bookId)){const old=byId.get(b.bookId);if(old&&String(old.row[8]).split('; ').includes(issue.issue)){old.row[11]=append(old.row[11],'本期最新回覆未推薦，請先核對其他推薦者及訂單 / Latest response omits this entry; review other recommenders and orders');if(old.row[8]===issue.issue&&old.row[10]==='待確認 / Review'){old.row[10]='不採購 / Declined';old.row[11]=append(old.row[11],'[auto-withdrawn:'+issue.issue+']');}updates.push({updateCells:{start:{sheetId:issue.buyerSheetId||2005,rowIndex:old.index,columnIndex:0},rows:[{values:old.row.map(val)}],fields:'userEnteredValue'}});}continue;}
 const caution='館藏未定；採購前複查館藏、訂單及格式；同題名紙電版不得直接重複購買 / Holdings uncertain; recheck holdings, orders and format; resolve print/ebook duplicates before purchase';
 const old=byId.get(b.bookId);if(old){const marker='[auto-withdrawn:'+issue.issue+']';if(old.row[10]==='不採購 / Declined'&&String(old.row[11]).split('; ').includes(marker)){old.row[10]='待確認 / Review';old.row[11]=String(old.row[11]).split('; ').filter(x=>x!==marker).join('; ');old.row[11]=append(old.row[11],'研究者重新推薦，待館員覆核 / Researcher reselected; staff review required');}old.row[6]=append(old.row[6],issue.researcher);old.row[8]=append(old.row[8],issue.issue);old.row[9]=append(old.row[9],response.id);old.row[11]=append(old.row[11],caution);updates.push({updateCells:{start:{sheetId:issue.buyerSheetId||2005,rowIndex:old.index,columnIndex:0},rows:[{values:old.row.map(val)}],fields:'userEnteredValue'}});}else rows.push([b.bookId,b.title,b.isbn,b.author,trim(b.publisher),'待核對 / Verify format',issue.researcher,time,issue.issue,response.id,'待確認 / Review',caution,source[12]||'',(source[10]||'')+' | '+(source[11]||''),'未通知；依正式採購設定處理 / Not notified; follow configured handoff',(b.catalogUrl||'').split('&')[0]]);
 }
 const summary=JSON.stringify({selectedNumbers:issue.books.filter(b=>selected.has(b.bookId)).map(b=>b.number),selectedBookIds:response.selectedBookIds,unselectedCount:issue.books.length-selected.size});
 const reply=[response.id,issue.issue,issue.recipient+'（個人連結 / personal link）',time,'網頁送出第'+response.revision+'版 / Web submission revision '+response.revision,summary,response.profileChange||'未提出 / None submitted',response.feedback||'未提出 / None submitted','已記錄；館藏與偏好變更待處理 / Recorded; holdings and requested preference changes await processing'];
 return {alreadyRecorded:false,updates,newRows:rows,queueRows:queue.length,replyRow:replies.length,reply,requests:[]};
}
// Both the Worker and Apps Script run these exact operations, using their own transport.
function* reconciliation(issue,response){
 const id=sheetId(issue.workbookUrl);const metadata=yield [id,'?fields=sheets(properties,tables)'];const q=metadata.sheets.find(s=>s.properties.title==='採購清單 Buyer queue'),rt=metadata.sheets.find(s=>s.properties.title==='回覆記錄 Replies'),rs=metadata.sheets.find(s=>s.properties.title===(issue.researcherSheet||issue.researcher));
 if(!q||!rt||!rs)throw Error('找不到本期工作表 / Issue worksheet missing');
 issue={...issue,researcherSheet:rs.properties.title,researcherSheetId:rs.properties.sheetId,buyerSheetId:q.properties.sheetId,repliesSheetId:rt.properties.sheetId};
 const ranges=["'採購清單 Buyer queue'!A1:P"+q.properties.gridProperties.rowCount,"'回覆記錄 Replies'!A1:I"+rt.properties.gridProperties.rowCount,"'"+rs.properties.title.replace(/'/g,"''")+"'!A1:R"+rs.properties.gridProperties.rowCount];
 const query='?'+ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&');const data=yield [id,'/values:batchGet'+query];const p=planReconciliation(issue,response,data);
 if(!p.alreadyRecorded){const requests=[];const end=p.queueRows+p.newRows.length;
 if(end>q.properties.gridProperties.rowCount)requests.push({appendDimension:{sheetId:issue.buyerSheetId||2005,dimension:'ROWS',length:end-q.properties.gridProperties.rowCount}});
 if(p.replyRow+1>rt.properties.gridProperties.rowCount)requests.push({appendDimension:{sheetId:issue.repliesSheetId||2006,dimension:'ROWS',length:20}});
 if(p.newRows.length){for(const pasteType of ['PASTE_FORMAT','PASTE_DATA_VALIDATION'])requests.push({copyPaste:{source:{sheetId:issue.buyerSheetId||2005,startRowIndex:Math.max(1,p.queueRows-1),endRowIndex:Math.max(1,p.queueRows-1)+1,startColumnIndex:0,endColumnIndex:16},destination:{sheetId:issue.buyerSheetId||2005,startRowIndex:p.queueRows,endRowIndex:end,startColumnIndex:0,endColumnIndex:16},pasteType}});requests.push({updateCells:{start:{sheetId:issue.buyerSheetId||2005,rowIndex:p.queueRows,columnIndex:0},rows:p.newRows.map(r=>({values:r.map(val)})),fields:'userEnteredValue'}});const table=q.tables?.find(t=>t.range.startRowIndex===0);if(table)requests.push({updateTable:{table:{tableId:table.tableId,range:{...table.range,endRowIndex:end}},fields:'range'}});}
 requests.push(...p.updates,{updateCells:{start:{sheetId:issue.repliesSheetId||2006,rowIndex:p.replyRow,columnIndex:0},rows:[{values:p.reply.map(val)}],fields:'userEnteredValue'}});yield [id,':batchUpdate',{requests}];}
 const checkedRanges=[ranges[0].replace(/\d+$/,String(Math.max(q.properties.gridProperties.rowCount,p.queueRows+(p.newRows?.length||0)))),ranges[1].replace(/\d+$/,String(Math.max(rt.properties.gridProperties.rowCount,(p.replyRow||0)+1))),ranges[2]];
 const checked=yield [id,'/values:batchGet?'+checkedRanges.map(r=>'ranges='+encodeURIComponent(r)).join('&')];
 const [qc,check,rc]=(checked.valueRanges||[]).map(b=>b.values||[]);
 const reply=check?.find(r=>r[0]===response.id);let summary;try{summary=JSON.parse(reply?.[5]);}catch{}
 const researcherVerified=issue.books.every(b=>{const r=rc?.[b.sheetRow-1];return r?.[0]===b.bookId&&r?.[1]===b.title&&String(r?.[17]||'').includes('Web response '+response.id+' v'+response.revision+': '+(response.selectedBookIds.includes(b.bookId)?'已推薦 / Recommended':'本次未勾選 / Not selected this submission'));});
 const updatesVerified=(p.updates||[]).filter(u=>u.updateCells.start.columnIndex===0).every(u=>{const actual=qc?.[u.updateCells.start.rowIndex];return u.updateCells.rows[0].values.every((v,i)=>String(actual?.[i]||'')===v.userEnteredValue.stringValue);});
 if(!reply||summary?.selectedBookIds?.join('\n')!==response.selectedBookIds.join('\n')||String(reply[6]||'')!==(response.profileChange||'未提出 / None submitted')||String(reply[7]||'')!==(response.feedback||'未提出 / None submitted')||!researcherVerified||!updatesVerified||!response.selectedBookIds.every(bookId=>qc?.some(r=>r[0]===bookId&&String(r[9]).split('; ').includes(response.id))))throw Error('試算表讀回核對未完成 / Workbook readback incomplete');
 return {workbookUrl:issue.workbookUrl,range:checkedRanges.join('; '),readbackVerified:true};
}
async function writeResponse(api,issue,response){const steps=reconciliation(issue,response);let step=steps.next();while(!step.done)step=steps.next(await api(...step.value));return step.value;}
