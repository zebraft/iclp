// Issue snapshots and immutable responses. Never infer selections from page visits.
export class ReviewError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const hashToken=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const plain=s=>typeof s==='string';
const bounded=(s,n)=>plain(s)&&s.length<=n;
export function candidateSheetTitle(researcher){const title='AI candidates - '+researcher;if(title.length>100)throw new ReviewError('候選分頁名稱過長，請提供明確簡稱 / Candidate sheet name too long; use a clear short name');return title;}
export function validateIssue(raw){
 if(!raw||!bounded(raw.issue,100)||!raw.issue||!bounded(raw.researcher,200)||!bounded(raw.recipient,254)||!/^\S+@\S+\.\S+$/.test(raw.recipient)||!bounded(raw.workbookUrl,500)||!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(raw.workbookUrl)||!Array.isArray(raw.books)||!raw.books.length||raw.books.length>300)throw new ReviewError('薦購期別資料不完整 / Invalid issue');
 if(!bounded(raw.profileZh,3000)||!bounded(raw.profileEn,3000))throw new ReviewError('研究概況不完整 / Invalid profile');
 const ids=new Set();
 const books=raw.books.map((b,i)=>{if(!b||!bounded(b.bookId,100)||!b.bookId||ids.has(b.bookId)||b.number!==i+1||!bounded(b.title,1000)||!b.title)throw new ReviewError('書目編號不符 / Invalid book mapping');ids.add(b.bookId);
 for(const k of ['author','publisher','isbn','reason','listedDate'])if(b[k]!==undefined&&!bounded(b[k],3000))throw new ReviewError('書目資料不符 / Invalid bibliography');
 for(const k of ['sourceUrl','catalogUrl','googleUrl'])if(b[k]!==undefined&&(!bounded(b[k],3000)||!/^https:\/\//.test(b[k])))throw new ReviewError('連結格式不符 / Invalid link');
 return {number:b.number,bookId:b.bookId,title:b.title,author:b.author||'',publisher:b.publisher||'',isbn:b.isbn||'',reason:b.reason||'',listedDate:b.listedDate||'',sourceUrl:b.sourceUrl||'',catalogUrl:b.catalogUrl||'',googleUrl:b.googleUrl||'',sheetRow:b.sheetRow||null,holdings:'uncertain'};});
 const researcherSheet=raw.researcherSheet||candidateSheetTitle(raw.researcher);if(!bounded(researcherSheet,100)||!researcherSheet.startsWith('AI candidates - '))throw new ReviewError('候選分頁須明確標示 AI candidates / Label the source tab AI candidates');
 return {issue:raw.issue,researcher:raw.researcher,researcherSheet,recipient:raw.recipient,profileZh:raw.profileZh,profileEn:raw.profileEn,workbookUrl:raw.workbookUrl,books};
}
export async function createReview(db,ownerId,raw){
 if(!ownerId)throw new ReviewError('請先登入 / Sign in required',401);
 const issue=validateIssue(raw);const id=crypto.randomUUID();const token=crypto.randomUUID()+crypto.randomUUID();const tokenHash=await hashToken(token);const createdAt=new Date().toISOString();
 await db.prepare('INSERT INTO recommendation_issues (id,owner_id,token_hash,issue_key,payload,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(id,ownerId,tokenHash,issue.issue,JSON.stringify(issue),createdAt,Date.now()+90*86400000).run();
 return {id,token,issue:issue.issue,count:issue.books.length,createdAt};
}
async function authorized(db,id,token){
 if(!bounded(token,200)||token.length<40)throw new ReviewError('連結無效 / Invalid link',404);
 const row=await db.prepare('SELECT * FROM recommendation_issues WHERE id=? AND token_hash=?').bind(id,await hashToken(token)).first();
 if(!row||row.expires_at<Date.now())throw new ReviewError('連結無效或已過期 / Invalid or expired link',404);return row;
}
// A personal checklist authorizes this issue only, never access to staff records.
export function publicBook(book){
 const out={};for(const key of ['number','bookId','title','author','publisher','isbn','listedDate','holdings'])if(book[key]!==undefined)out[key]=book[key];
 for(const key of ['sourceUrl','catalogUrl','googleUrl']){try{const url=new URL(book[key]);if(url.protocol!=='https:'||url.username||url.password||/^(?:docs|drive|sheets|script)\.google\.com$/.test(url.hostname)||url.hostname==='chatgpt.com'||url.hostname.endsWith('.chatgpt.site')||['key','token','access_token','auth'].some(k=>url.searchParams.has(k)))continue;out[key]=url.href;}catch{}}
 return out;
}
export function publicReview(id,issue,latest){
 const response=latest?{id:latest.id,revision:latest.revision,submittedAt:latest.submittedAt,selectedBookIds:latest.selectedBookIds,confirmNone:!!latest.confirmNone,purchaseReady:!!latest.purchaseReady,holdingsReviewRequired:!!latest.holdingsReviewRequired,workbookSynced:!!latest.workbookSynced}:null;
 return {id,books:issue.books.map(publicBook),latest:response};
}
export async function readReview(db,id,token){
 const row=await authorized(db,id,token);const latest=await db.prepare('SELECT payload,revision,id,submitted_at,synced_at FROM recommendation_responses WHERE issue_id=? ORDER BY revision DESC LIMIT 1').bind(id).first();
 return publicReview(id,JSON.parse(row.payload),latest?{...JSON.parse(latest.payload),id:latest.id,revision:latest.revision,submittedAt:latest.submitted_at,workbookSynced:!!latest.synced_at}:null);
}
export function validateResponse(raw,issue){
 if(!raw||raw.reviewed!==true||!Array.isArray(raw.selectedBookIds)||raw.selectedBookIds.length>issue.books.length||!Number.isInteger(raw.baseRevision)||raw.baseRevision<0||!bounded(raw.idempotencyKey,100)||!raw.idempotencyKey)throw new ReviewError('請先檢視並確認選擇 / Review your choices first');
 const ids=new Set(raw.selectedBookIds);if(ids.size!==raw.selectedBookIds.length||[...ids].some(id=>!issue.books.some(b=>b.bookId===id)))throw new ReviewError('書目編號不符 / Invalid book selection');
 if(!ids.size&&raw.confirmNone!==true)throw new ReviewError('請明確確認本期不推薦 / Confirm that you recommend none');
 if(!bounded(raw.profileChange||'',4000)||!bounded(raw.feedback||'',4000))throw new ReviewError('文字過長 / Text too long');
 return {selectedBookIds:issue.books.filter(b=>ids.has(b.bookId)).map(b=>b.bookId),selectedBooks:issue.books.filter(b=>ids.has(b.bookId)),profileChange:raw.profileChange||'',feedback:raw.feedback||'',confirmNone:!ids.size,purchaseReady:false,holdingsReviewRequired:true};
}
export async function submitReview(db,id,token,raw,actorId){
 const row=await authorized(db,id,token);const issue=JSON.parse(row.payload);const data=validateResponse(raw,issue);
 const previous=await db.prepare('SELECT id,payload,revision,submitted_at FROM recommendation_responses WHERE issue_id=? AND idempotency_key=?').bind(id,raw.idempotencyKey).first();
 const result=r=>({id:r.id,revision:r.revision,submittedAt:r.submitted_at,selectedCount:JSON.parse(r.payload).selectedBookIds.length,status:'recorded_pending_workbook_sync'});
 if(previous){if(JSON.stringify(JSON.parse(previous.payload))!==JSON.stringify(data))throw new ReviewError('重試內容不符，請重新載入 / Retry content changed; reload',409);return result(previous);}
 const responseId=crypto.randomUUID(),submittedAt=new Date().toISOString(),revision=raw.baseRevision+1;
 const changed=await db.prepare('INSERT INTO recommendation_responses (id,issue_id,revision,idempotency_key,payload,actor_id,submitted_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COALESCE(MAX(revision),0) FROM recommendation_responses WHERE issue_id=?)=? ON CONFLICT DO NOTHING').bind(responseId,id,revision,raw.idempotencyKey,JSON.stringify(data),actorId,submittedAt,id,raw.baseRevision).run();
 if(!changed.meta.changes){const retry=await db.prepare('SELECT id,payload,revision,submitted_at FROM recommendation_responses WHERE issue_id=? AND idempotency_key=?').bind(id,raw.idempotencyKey).first();if(retry&&JSON.stringify(JSON.parse(retry.payload))===JSON.stringify(data))return result(retry);throw new ReviewError('已有較新的回覆，請重新載入 / A newer response exists; reload',409);}
 return result({id:responseId,revision,payload:JSON.stringify(data),submitted_at:submittedAt});
}
export async function listResponses(db,ownerId,issueId){
 if(!ownerId)throw new ReviewError('請先登入 / Sign in required',401);
 const issues=issueId?await db.prepare('SELECT id,payload,created_at FROM recommendation_issues WHERE owner_id=? AND id=?').bind(ownerId,issueId).all():await db.prepare('SELECT id,payload,created_at FROM recommendation_issues WHERE owner_id=? ORDER BY created_at DESC LIMIT 30').bind(ownerId).all();
 return Promise.all(issues.results.map(async row=>({id:row.id,...JSON.parse(row.payload),responses:(await db.prepare('SELECT id,revision,payload,submitted_at,synced_at,sync_receipt FROM recommendation_responses WHERE issue_id=? ORDER BY revision').bind(row.id).all()).results.map(r=>({id:r.id,revision:r.revision,...JSON.parse(r.payload),submittedAt:r.submitted_at,syncedAt:r.synced_at,syncReceipt:r.sync_receipt?JSON.parse(r.sync_receipt):null}))})));
}
export async function markSynced(db,ownerId,responseId,receipt){
 if(!receipt||!bounded(receipt.workbookUrl,500)||!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(receipt.workbookUrl)||!bounded(receipt.range,2000)||receipt.readbackVerified!==true)throw new ReviewError('需要試算表核對收據 / Verified workbook receipt required');
 const row=await db.prepare('SELECT r.id,i.payload FROM recommendation_responses r JOIN recommendation_issues i ON r.issue_id=i.id WHERE r.id=? AND i.owner_id=?').bind(responseId,ownerId).first();if(!row)throw new ReviewError('查無回覆 / Response not found',404);
 if(JSON.parse(row.payload).workbookUrl!==receipt.workbookUrl)throw new ReviewError('試算表不符 / Workbook mismatch');
 await db.prepare('UPDATE recommendation_responses SET synced_at=?,sync_receipt=? WHERE id=?').bind(new Date().toISOString(),JSON.stringify(receipt),responseId).run();return {id:responseId,synced:true};
}
