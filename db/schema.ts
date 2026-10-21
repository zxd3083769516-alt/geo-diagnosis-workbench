import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
// Stable IDs and foreign references live in the versioned JSON envelope. This table
// stores one atomic workspace per authenticated user, with optimistic concurrency.
export const workspaces = sqliteTable('geo_workspaces', {
  ownerId: text('owner_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const snapshots = sqliteTable('geo_workspace_history', {
  ownerId: text('owner_id').notNull(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.revision] })]);
export const records = sqliteTable('geo_records', {
  ownerId: text('owner_id').notNull(),
  id: text('id').notNull(),
  clientId: text('client_id').notNull(),
  kind: text('kind').notNull(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.id] }), index('geo_records_owner_client_kind').on(table.ownerId, table.clientId, table.kind)]);
