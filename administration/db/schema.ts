import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const credentials = sqliteTable('credentials', {
  userId: text('user_id').primaryKey(),
  sealed: text('sealed').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const holdingsCache = sqliteTable('holdings_cache', {
  key: text('cache_key').primaryKey(),
  payload: text('payload').notNull(),
  expiresAt: integer('expires_at').notNull()
});

export const recommendationIssues = sqliteTable('recommendation_issues', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), tokenHash: text('token_hash').notNull(),
 issueKey: text('issue_key').notNull(), payload: text('payload').notNull(), createdAt: text('created_at').notNull(), expiresAt: integer('expires_at').notNull()
});
export const recommendationResponses = sqliteTable('recommendation_responses', {
 id: text('id').primaryKey(), issueId: text('issue_id').notNull(), revision: integer('revision').notNull(), idempotencyKey: text('idempotency_key').notNull(),
 payload: text('payload').notNull(), actorId: text('actor_id').notNull(), submittedAt: text('submitted_at').notNull(), syncedAt: text('synced_at'), syncReceipt: text('sync_receipt')
}, t=>[uniqueIndex('response_issue_revision').on(t.issueId,t.revision),uniqueIndex('response_issue_retry').on(t.issueId,t.idempotencyKey)]);
export const sheetSyncLock = sqliteTable('sheet_sync_lock', {
 id: text('id').primaryKey(), lease: text('lease').notNull(), expiresAt: integer('expires_at').notNull()
});
