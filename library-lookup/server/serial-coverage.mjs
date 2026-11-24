// Conservative aid for explicit, closed year ranges in public serial statements.
// It never establishes issue completeness, electronic access or entitlement.
export function assessSerialCoverage(holdings,year){
 const evidence=[];
 for(const h of holdings)for(const text of [h.summary,...(h.statements||[]).flatMap(s=>[s.summary,s.text])].filter(Boolean)){
  for(const m of text.matchAll(/\b((?:1|2)\d{3})\s*[-–—]\s*((?:1|2)\d{3})\b/g)){
   const start=Number(m[1]),end=Number(m[2]);if(start<=end)evidence.push({branchCode:h.branchCode,collection:h.collection,start,end,text});
  }
 }
 const within=evidence.filter(e=>year>=e.start&&year<=e.end);
 return {citationYear:year,yearEvidence:within.length?'within_reported_range':evidence.length?'outside_parsed_ranges':'unparsed',evidence:within.length?within:evidence,issueCoverageVerified:false,fullTextAccessVerified:false,coverageComplete:false};
}
