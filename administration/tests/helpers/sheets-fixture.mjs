export function sheetsFixture(issue,{ignoreResearch=false}={}){
 const names=['採購清單 Buyer queue','回覆記錄 Replies',issue.researcherSheet||issue.researcher];
 const ids=[2005,2006,2001];
 const values=[[["書籍 ID / Book ID"]],[["回覆 ID / Reply ID"]],[["書籍 ID / Book ID"]]];
 for(const b of issue.books){values[2][b.sheetRow-1]=[b.bookId,b.title,b.isbn||'',b.author||'',b.publisher||'','','','uncertain','','review evidence','catalog evidence',b.catalogUrl||'','2026-11-17','','','','','Existing note'];}
 let writes=0;
 const metadata={sheets:names.map((title,i)=>({properties:{sheetId:ids[i],title,gridProperties:{rowCount:100}},...(i===0?{tables:[{tableId:'queue',range:{sheetId:2005,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:16}}]}:{})}))};
 const api=(id,path,body)=>{
  if(path.startsWith('?fields='))return {spreadsheetId:id,properties:{title:'Pilot'},...metadata};
  if(path.startsWith('/values:batchGet?'))return {valueRanges:names.map((name,i)=>({range:"'"+name.replace(/'/g,"''")+"'!A1:"+['P','I','R'][i]+'100',values:structuredClone(values[i])}))};
  if(path===':batchUpdate'){writes++;for(const req of body.requests){const u=req.updateCells;if(u){const index=ids.indexOf(u.start.sheetId);if(index===2&&ignoreResearch)continue;for(const [i,row] of u.rows.entries()){const target=values[index][u.start.rowIndex+i]??=[];row.values.forEach((v,j)=>target[u.start.columnIndex+j]=v.userEnteredValue.stringValue);}}}return {};}
  throw Error('Unexpected Sheets operation '+path);
 };
 return {api,values,metadata,get writes(){return writes;}};
}
