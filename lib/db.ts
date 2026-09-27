import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { seed } from "./seed";

/*
 * SQLite via Node's built-in `node:sqlite` (Node >= 22.13) so v1 runs with zero
 * native deps. Every business table carries owner_id for multi-tenancy.
 * Schema mirrors the PRD data model; swap to Postgres later by porting SCHEMA.
 * Money is stored as whole rupees (INTEGER).
 */

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER,                         -- owner: self; manager/resident: their owner
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','resident','staff')),
  status TEXT NOT NULL DEFAULT 'active',    -- invited | active | read_only
  business_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  address TEXT,
  type TEXT NOT NULL DEFAULT 'coed',        -- boys | girls | coed
  amenities TEXT,
  rules TEXT,
  wifi_name TEXT,
  wifi_password TEXT,
  contact_phone TEXT,
  billing_day INTEGER NOT NULL DEFAULT 1,
  due_day INTEGER NOT NULL DEFAULT 5,
  late_fee INTEGER NOT NULL DEFAULT 0,
  notice_days INTEGER NOT NULL DEFAULT 30,
  show_roommates INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS manager_properties (
  user_id INTEGER NOT NULL REFERENCES users(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  PRIMARY KEY (user_id, property_id)
);
CREATE TABLE IF NOT EXISTS floors (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  floor_id INTEGER NOT NULL REFERENCES floors(id),
  number TEXT NOT NULL,
  sharing INTEGER NOT NULL,
  is_ac INTEGER NOT NULL DEFAULT 0,
  attached_bath INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS beds (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  label TEXT NOT NULL,
  monthly_rent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'vacant'     -- vacant | occupied | reserved | notice | maintenance
);
CREATE TABLE IF NOT EXISTS resident_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  emergency_name TEXT,
  emergency_phone TEXT,
  occupation TEXT,
  college_company TEXT,
  permanent_address TEXT,
  rules_accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS stays (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  resident_id INTEGER NOT NULL REFERENCES users(id),
  bed_id INTEGER NOT NULL REFERENCES beds(id),
  move_in TEXT NOT NULL,
  move_out TEXT,
  rent INTEGER NOT NULL,
  deposit INTEGER NOT NULL DEFAULT 0,
  notice_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',    -- reserved | active | notice | closed | shifted
  deductions INTEGER,
  deduction_note TEXT,
  refund_amount INTEGER,
  refund_paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  resident_id INTEGER,                      -- set when the file belongs to a resident
  uploaded_by INTEGER NOT NULL,
  stored_name TEXT NOT NULL,
  original_name TEXT,
  mime TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  resident_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,                       -- aadhaar | pan | passport | agreement | police
  file_id TEXT NOT NULL REFERENCES files(id),
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  stay_id INTEGER NOT NULL REFERENCES stays(id),
  month TEXT NOT NULL,                      -- YYYY-MM
  due_date TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid | partial | paid
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (stay_id, month)
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  kind TEXT NOT NULL,                       -- rent | electricity | food | laundry | late_fee | other
  label TEXT NOT NULL,
  amount INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount INTEGER NOT NULL,
  mode TEXT NOT NULL,                       -- gateway | cash | upi | bank
  reference TEXT,
  note TEXT,
  proof_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed', -- pending | confirmed | rejected
  recorded_by INTEGER,
  paid_at TEXT NOT NULL,
  receipt_no TEXT
);
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  resident_id INTEGER NOT NULL,
  room_id INTEGER,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  photo_file_id TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',  -- low | normal | high
  status TEXT NOT NULL DEFAULT 'open',      -- open | in_progress | resolved | closed
  assigned_to INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  rating INTEGER
);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  property_id INTEGER,                      -- NULL = all properties
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS counters (
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, name)
);
CREATE INDEX IF NOT EXISTS idx_beds_property ON beds(property_id);
CREATE INDEX IF NOT EXISTS idx_stays_resident ON stays(resident_id);
CREATE INDEX IF NOT EXISTS idx_stays_bed ON stays(bed_id);
CREATE INDEX IF NOT EXISTS idx_invoices_month ON invoices(owner_id, month);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_complaints_owner ON complaints(owner_id, status);
`;

type Row = Record<string, any>;
const g = globalThis as unknown as { __stayeasyDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__stayeasyDb) return g.__stayeasyDb;
  // getBuiltinModule keeps the bundler from trying to resolve node:sqlite.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = path.join(DATA_DIR, "stayeasy.db");
  const fresh = !fs.existsSync(file);
  const conn = new DatabaseSync(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  conn.exec(SCHEMA);
  g.__stayeasyDb = conn; // set before seeding so seed can use the helpers below
  if (fresh) seed();
  return conn;
}

// node:sqlite returns null-prototype rows; spread them into plain objects so
// they can be passed to Client Components.
export function all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return db().prepare(sql).all(...params).map((r) => ({ ...r })) as T[];
}
export function get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  const r = db().prepare(sql).get(...params);
  return r ? ({ ...r } as T) : undefined;
}
export function run(sql: string, ...params: SQLInputValue[]) {
  const r = db().prepare(sql).run(...params);
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
}
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function nextCounter(ownerId: number, name: string): number {
  run(
    `INSERT INTO counters (owner_id, name, value) VALUES (?, ?, 1)
     ON CONFLICT(owner_id, name) DO UPDATE SET value = value + 1`,
    ownerId,
    name,
  );
  return get<{ value: number }>("SELECT value FROM counters WHERE owner_id = ? AND name = ?", ownerId, name)!.value;
}

export function logActivity(ownerId: number, userId: number, action: string, entity: string, entityId: number | null, detail?: string) {
  run(
    "INSERT INTO activity_log (owner_id, user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
    ownerId,
    userId,
    action,
    entity,
    entityId,
    detail ?? null,
  );
}
