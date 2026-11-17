import {googleStatus,assertDeliveryWorkbook} from '../../lib/sheet-sync';
import {env} from 'cloudflare:workers';
import {createReview,listResponses,markSynced,ReviewError} from '../../lib/recommendations.mjs';
import { checkBooks,userId,json,safeError } from '../../lib/service';
import { getLibraryCredentials } from '../../lib/credentials';
import { authenticate } from '../../lib/worldcat.mjs';
const tools=[
 {name:'recommendation_delivery_status',description:'查看直接寫入薦購試算表是否完成設定及待同步回覆數，不回傳金鑰。 / Check direct workbook delivery configuration and pending-response count without returning keys.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'create_recommendation_checklist',description:'建立不可變編號的個人薦購確認頁；需提供完整書目與共用試算表。不寄信、不下訂。 / Create a personal checklist with immutable book numbering. Does not send email or place orders.',inputSchema:{type:'object',properties:{issue:{type:'string'},researcher:{type:'string'},recipient:{type:'string'},profileZh:{type:'string'},profileEn:{type:'string'},workbookUrl:{type:'string'},books:{type:'array',minItems:1,maxItems:300,items:{type:'object',properties:{number:{type:'integer'},bookId:{type:'string'},title:{type:'string'},author:{type:'string'},publisher:{type:'string'},isbn:{type:'string'},reason:{type:'string'},listedDate:{type:'string'},sourceUrl:{type:'string'},catalogUrl:{type:'string'},googleUrl:{type:'string'},sheetRow:{type:'integer'}},required:['number','bookId','title']}}},required:['issue','researcher','recipient','profileZh','profileEn','workbookUrl','books']}},
 {name:'get_recommendation_responses',description:'讀取自己建立的薦購確認頁與回覆。已連接時，送出會直接同步試算表；pending 僅需故障復原。保留書目編號、去重及館藏複查旗標；不寄信或下訂。 / Read your checklist responses. Connected submissions sync directly; pending entries need recovery only. Preserve numbering, deduplication and holdings review; no email or orders.',inputSchema:{type:'object',properties:{checklistId:{type:'string'}},additionalProperties:false}},
 {name:'mark_recommendation_response_synced',description:'僅在試算表寫入並讀回核對後，標記回覆已同步。 / Mark a response synchronized only after workbook write and readback verification.',inputSchema:{type:'object',properties:{responseId:{type:'string'},receipt:{type:'object',properties:{workbookUrl:{type:'string'},range:{type:'string'},readbackVerified:{type:'boolean'}},required:['workbookUrl','range','readbackVerified']}},required:['responseId','receipt'],additionalProperties:false}},
 {name:'worldcat_connection_status',description:'檢查圖書館共用 OCLC 憑證與 API 連線；不回傳憑證。 / Check the shared library OCLC connection without returning credentials.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'check_as_holdings',description:'ISBN 優先查核，每次最多3本；重用共用的近期證據。refresh=true 略過快取重新查核。全院涵蓋、訂單及版本仍需覆核；不自動剔除或購買。 / ISBN-first checks for up to three books, reusing recent shared evidence. Set refresh=true for a fresh lookup. AS-wide coverage, orders and editions require review; no automatic exclusions or purchases.',inputSchema:{type:'object',properties:{refresh:{type:'boolean',description:'略過快取，向 OCLC 重新查詢 / Bypass cache for a fresh OCLC lookup'},books:{type:'array',minItems:1,maxItems:3,items:{type:'object',properties:{title:{type:'string',minLength:2,maxLength:500},isbn:{type:'string',description:'ISBN-10 or ISBN-13 without hyphens'},author:{type:'string'},sourceListDate:{type:'string'},source:{type:'string'}},required:['title'],additionalProperties:false}}},required:['books'],additionalProperties:false}}
];
export async function POST(req:Request){
 let rpc:any;try{rpc=await req.json();
 if(rpc.method==='server/discover')return json({jsonrpc:'2.0',id:rpc.id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{}}}});
 if(rpc.method==='initialize')return json({jsonrpc:'2.0',id:rpc.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'as-holdings-checker',version:'1.3.0'}}});
 if(rpc.method==='notifications/initialized')return new Response(null,{status:204});
 if(rpc.method==='tools/list')return json({jsonrpc:'2.0',id:rpc.id,result:{tools}});
 if(rpc.method!=='tools/call')return json({jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Method not found'}});
 const uid=userId(req);
 let value;
 if(rpc.params?.name==='worldcat_connection_status'){const c=await getLibraryCredentials();if(!c)value={configured:false,message:'請聯絡管理員設定機構憑證 / Ask the administrator to configure institutional credentials',allASCoverageVerified:false};else{await authenticate(c.id,c.secret);value={configured:true,credentialScope:'library',authentication:'successful',allASCoverageVerified:false,orderStatusVerified:false};}}
 else if(rpc.params?.name==='recommendation_delivery_status'){const status=await googleStatus();const pending=await env.DB.prepare('SELECT COUNT(*) AS count FROM recommendation_responses r WHERE synced_at IS NULL AND revision=(SELECT MAX(x.revision) FROM recommendation_responses x WHERE x.issue_id=r.issue_id)').first();value={automaticWorkbookWrites:status.configured&&status.healthy,credentialsStored:status.configured,connectionHealthy:status.healthy,provider:status.provider,staffWorkbookUrl:status.workbookUrl||null,pendingResponses:pending?.count||0,setupUrl:'https://administration.example.invalid/sheets/setup',automaticRetryTriggerInstalled:status.retryTriggerInstalled,lastRetryAt:status.lastRetryAt||null,backgroundPollingConfigured:false};}
 else if(rpc.params?.name==='create_recommendation_checklist'){await assertDeliveryWorkbook(rpc.params.arguments?.workbookUrl);const r=await createReview(env.DB,uid,rpc.params.arguments);value={...r,url:'https://checklist.example.invalid/recommendations/'+r.id+'#'+r.token};}
 else if(rpc.params?.name==='get_recommendation_responses')value=await listResponses(env.DB,uid,rpc.params.arguments?.checklistId);
 else if(rpc.params?.name==='mark_recommendation_response_synced')value=await markSynced(env.DB,uid,rpc.params.arguments?.responseId,rpc.params.arguments?.receipt);
 else if(rpc.params?.name==='check_as_holdings')value=await checkBooks(uid,rpc.params?.arguments?.books,{refresh:rpc.params?.arguments?.refresh});
 else throw Error('Unknown tool');
 return json({jsonrpc:'2.0',id:rpc.id,result:{content:[{type:'text',text:JSON.stringify(value)}]}});
 }catch(e){return json({jsonrpc:'2.0',id:rpc?.id??null,result:{isError:true,content:[{type:'text',text:e instanceof ReviewError?e.message:safeError(e)}]}});}
}
