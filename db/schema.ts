import { sqliteTable, text, integer, primaryKey, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const members = sqliteTable('members', {
  student_id: text().primaryKey(), name: text().notNull(), role: text().notNull().default('member'),
  password_hash: text(), invitation_hash: text(), created_at: text().notNull(),
}, t => [check('member_role', sql`${t.role} IN ('member','admin')`)]);
export const sessions = sqliteTable('sessions', {
  token_hash: text().primaryKey(), student_id: text().notNull().references(() => members.student_id, {onDelete:'cascade'}), expires_at: integer().notNull(),
}, t => [index('sessions_member').on(t.student_id)]);
export const attempts = sqliteTable('login_attempts', { key: text().primaryKey(), count: integer().notNull(), reset_at: integer().notNull() });
export const bands = sqliteTable('bands', { id: text().primaryKey(), name: text().notNull(), status: text().notNull().default('active') }, t => [uniqueIndex('active_band_name').on(t.name).where(sql`${t.status} = 'active'`)]);
export const bandMembers = sqliteTable('band_members', {
  band_id: text().notNull().references(() => bands.id, {onDelete:'cascade'}), student_id: text().notNull().references(() => members.student_id),
}, t => [primaryKey({columns:[t.band_id,t.student_id]})]);
export const days = sqliteTable('room_days', { date:text().primaryKey(), is_open:integer({mode:'boolean'}).notNull(), note:text().notNull().default('') });
export const slots = sqliteTable('room_slots', { date:text().notNull(), slot_id:text().notNull(), is_open:integer({mode:'boolean'}).notNull(), note:text().notNull().default('') }, t => [primaryKey({columns:[t.date,t.slot_id]})]);
export const reservations = sqliteTable('reservations', {
  id:text().primaryKey(), date:text().notNull(), slot_id:text().notNull(), reservation_type:text().notNull(),
  student_id:text().notNull().references(() => members.student_id), band_id:text().references(() => bands.id), created_at:text().notNull(), cancelled_at:text(),
}, t => [uniqueIndex('one_active_per_slot').on(t.date,t.slot_id).where(sql`${t.cancelled_at} IS NULL`),index('reservation_person_month').on(t.student_id,t.date),index('reservation_band_month').on(t.band_id,t.date),check('reservation_type',sql`(${t.reservation_type}='band' AND ${t.band_id} IS NOT NULL) OR (${t.reservation_type}='personal' AND ${t.band_id} IS NULL)`)]);
export const requests = sqliteTable('band_requests', {
  id:text().primaryKey(), request_type:text().notNull(), band_name:text().notNull(), band_id:text().references(() => bands.id), student_id:text().notNull().references(() => members.student_id), reason:text().notNull().default(''), member_entries:text().notNull(), status:text().notNull().default('pending'), created_at:text().notNull(), reviewed_at:text(), reviewed_by:text().references(() => members.student_id),
}, t => [index('requests_status').on(t.status,t.created_at),check('request_type',sql`${t.request_type} IN ('create','update_members','dissolve')`),check('request_status',sql`${t.status} IN ('pending','approved','rejected')`)]);
export const settings = sqliteTable('settings', { id:integer().primaryKey(), personal_open_days:integer().notNull(), monthly_band_limit:integer().notNull(), monthly_personal_limit:integer().notNull(), weekly_open_slots:text().notNull() },t=>[check('settings_singleton',sql`${t.id}=1`)]);
