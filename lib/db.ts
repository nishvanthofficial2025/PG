import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { seed } from "./seed";

/*
 * Postgres everywhere:
 *  - DATABASE_URL / POSTGRES_URL set (Vercel + Neon) → node-postgres pool
 *  - otherwise (local dev) → PGlite, an in-process Postgres persisted to ./data/pglite
 * Every business table carries owner_id for multi-tenancy. Money is whole rupees
 * (INTEGER). Timestamps are ISO-ish TEXT to keep the app code database-agnostic.
 * Queries use "?" placeholders; they're rewritten to $1, $2… here.
 */

type Row = Record<string, any>;
export type Param = string | number | boolean | null | Uint8Array | Buffer;
type Query = (sql: string, params: Param[]) => Promise<Row[]>;
type Driver = { query: Query; transaction<T>(fn: (q: Query) => Promise<T>): Promise<T> };

/** SQL expression for "now" in the same text format SQLite used (UTC). */
export const NOW_SQL = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";
export const DATA_DIR = path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER,                         -- owner: self; manager/resident: their owner
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','resident','staff')),
  status TEXT NOT NULL DEFAULT 'active',    -- invited | active | read_only
  business_name TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL})
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
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL})
);
CREATE TABLE IF NOT EXISTS manager_properties (
  user_id INTEGER NOT NULL REFERENCES users(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  PRIMARY KEY (user_id, property_id)
);
CREATE TABLE IF NOT EXISTS floors (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  floor_id INTEGER NOT NULL REFERENCES floors(id),
  number TEXT NOT NULL,
  sharing INTEGER NOT NULL,
  is_ac INTEGER NOT NULL DEFAULT 0,
  attached_bath INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS beds (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL})
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  resident_id INTEGER,                      -- set when the file belongs to a resident
  uploaded_by INTEGER NOT NULL,
  stored_name TEXT NOT NULL,
  original_name TEXT,
  mime TEXT,
  data BYTEA NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL})
);
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  resident_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,                       -- aadhaar | pan | passport | agreement | police
  file_id TEXT NOT NULL REFERENCES files(id),
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL})
);
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  stay_id INTEGER NOT NULL REFERENCES stays(id),
  month TEXT NOT NULL,                      -- YYYY-MM
  due_date TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid | partial | paid
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL}),
  UNIQUE (stay_id, month)
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  kind TEXT NOT NULL,                       -- rent | electricity | food | laundry | late_fee | other
  label TEXT NOT NULL,
  amount INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL}),
  updated_at TEXT NOT NULL DEFAULT (${NOW_SQL}),
  resolved_at TEXT,
  rating INTEGER
);
CREATE TABLE IF NOT EXISTS notices (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  property_id INTEGER,                      -- NULL = all properties
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL})
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL}),
  read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW_SQL})
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

const g = globalThis as unknown as { __stayeasyDb?: Promise<Driver> };
const txStore = new AsyncLocalStorage<Query>();

function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

async function pgDriver(url: string): Promise<Driver> {
  const pg = (await import("pg")).default;
  pg.types.setTypeParser(20, (v) => Number(v)); // int8 (COUNT/SUM) → number
  pg.types.setTypeParser(1700, (v) => Number(v)); // numeric → number
  const pool = new pg.Pool({ connectionString: url, max: 5, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  const query: Query = async (sql, params) => (await pool.query(sql, params)).rows;
  return {
    query,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(async (sql, params) => (await client.query(sql, params)).rows);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

async function pgliteDriver(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  // On Vercel without DATABASE_URL only /tmp is writable: a throwaway demo database
  // that resets whenever the instance is recycled. Add Neon for persistent data.
  const dir = process.env.VERCEL ? "/tmp/stayeasy-pglite" : path.join(DATA_DIR, "pglite");
  (await import("node:fs")).mkdirSync(path.dirname(dir), { recursive: true });
  if (process.env.VERCEL) console.warn("[db] DATABASE_URL not set — using temporary PGlite in /tmp (data will reset)");
  const num = (v: string) => Number(v);
  const db = await PGlite.create(dir, { parsers: { 20: num, 1700: num } });
  const query: Query = async (sql, params) => (await db.query<Row>(sql, params as any[])).rows;
  return {
    query,
    transaction: (fn) => db.transaction(async (t) => fn(async (sql, params) => (await t.query<Row>(sql, params as any[])).rows)),
  };
}

async function init(): Promise<Driver> {
  const url = connectionString();
  const d = url ? await pgDriver(url) : await pgliteDriver();
  // Schema + demo seed once, serialized across cold-starting instances by an advisory lock.
  await d.transaction(async (q) => {
    await q("SELECT pg_advisory_xact_lock(724001)", []);
    for (const stmt of SCHEMA.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await q(stmt, []);
    const empty = Number((await q("SELECT COUNT(*) n FROM users", []))[0].n) === 0;
    if (empty && demoMode()) await txStore.run(q, () => seed());
  });
  return d;
}

function driver(): Promise<Driver> {
  if (!g.__stayeasyDb) {
    g.__stayeasyDb = init();
    g.__stayeasyDb.catch(() => (g.__stayeasyDb = undefined)); // retry on next request
  }
  return g.__stayeasyDb;
}

/** Demo mode: seed sample data and show OTPs on screen (no SMS provider yet). */
export function demoMode() {
  return process.env.NODE_ENV !== "production" || ["1", "true"].includes((process.env.DEMO_MODE ?? "").trim().toLowerCase());
}

/** "?" → $1, $2 …, datetime('now') → NOW_SQL, and INSERTs return the new row. */
function prepare(sql: string): string {
  let i = 0;
  let out = sql.replace(/datetime\('now'\)/g, NOW_SQL).replace(/'[^']*'|\?/g, (m) => (m === "?" ? "$" + ++i : m));
  if (/^\s*INSERT\b/i.test(out) && !/\bRETURNING\b/i.test(out)) out += " RETURNING *";
  return out;
}

async function exec(sql: string, params: Param[]): Promise<Row[]> {
  const inTx = txStore.getStore();
  if (inTx) return inTx(prepare(sql), params);
  return (await driver()).query(prepare(sql), params);
}

export async function all<T = Row>(sql: string, ...params: Param[]): Promise<T[]> {
  return (await exec(sql, params)) as T[];
}
export async function get<T = Row>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await exec(sql, params))[0] as T | undefined;
}
export async function run(sql: string, ...params: Param[]) {
  const rows = await exec(sql, params);
  return { id: Number(rows[0]?.id ?? 0), row: rows[0], changes: rows.length };
}
/** Runs fn in a transaction. Nested calls join the outer transaction. */
export async function tx<T>(fn: () => Promise<T> | T): Promise<T> {
  if (txStore.getStore()) return fn();
  return (await driver()).transaction((q) => txStore.run(q, async () => fn()));
}

export async function nextCounter(ownerId: number, name: string): Promise<number> {
  const r = await get<{ value: number }>(
    `INSERT INTO counters (owner_id, name, value) VALUES (?, ?, 1)
     ON CONFLICT (owner_id, name) DO UPDATE SET value = counters.value + 1 RETURNING value`,
    ownerId,
    name,
  );
  return r!.value;
}

export async function logActivity(ownerId: number, userId: number, action: string, entity: string, entityId: number | null, detail?: string) {
  await run(
    "INSERT INTO activity_log (owner_id, user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
    ownerId,
    userId,
    action,
    entity,
    entityId,
    detail ?? null,
  );
}
