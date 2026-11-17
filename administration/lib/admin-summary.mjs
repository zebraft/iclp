// Each operator sees their own issues. Workspace access never grants cross-user reads.
export async function recommendationSummary(db,ownerId){
 if(!ownerId)throw Error('Sign in required');
 const totals=await db.prepare('SELECT COUNT(*) AS received,COALESCE(SUM(CASE WHEN r.synced_at IS NULL THEN 1 ELSE 0 END),0) AS pending FROM recommendation_issues i JOIN recommendation_responses r ON r.issue_id=i.id WHERE i.owner_id=? AND r.revision=(SELECT MAX(x.revision) FROM recommendation_responses x WHERE x.issue_id=i.id)').bind(ownerId).first();
 const result=await db.prepare('SELECT i.payload AS issue_payload,r.id,r.payload,r.submitted_at,r.synced_at FROM recommendation_issues i JOIN recommendation_responses r ON r.issue_id=i.id WHERE i.owner_id=? AND r.revision=(SELECT MAX(x.revision) FROM recommendation_responses x WHERE x.issue_id=i.id) ORDER BY r.submitted_at DESC LIMIT 50').bind(ownerId).all();
 const recent=result.results.map(row=>{const i=JSON.parse(row.issue_payload),r=JSON.parse(row.payload);return {responseId:row.id,issue:i.issue,researcher:i.researcher,selectedCount:r.selectedBookIds.length,submittedAt:row.submitted_at,syncedAt:row.synced_at,workbookUrl:i.workbookUrl,hasProfileChange:!!r.profileChange,hasFeedback:!!r.feedback};});
 return {received:totals.received,pending:totals.pending,recent};
}
