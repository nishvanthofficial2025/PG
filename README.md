# StayEasy — PG management (v0.1)

Mobile-first web app for PG owners, managers and residents. This first version covers the PRD's
**Phase 1 (rent + beds)** plus the P0 operations modules.

## Run it

Requires Node **22.13+** (uses the built-in `node:sqlite` — no database server to install).

```bash
npm install
npm run dev          # http://localhost:3000
```

On first request the app creates `data/stayeasy.db` and seeds demo data. OTPs are shown on screen
in dev (and logged to the console). Demo logins:

| Role     | Name   | Phone      | Sees                              |
|----------|--------|------------|-----------------------------------|
| Owner    | Ramesh | 9876500001 | 2 PGs, 38 beds                    |
| Manager  | Suresh | 9876500002 | Sunrise Men's PG only             |
| Resident | Priya  | 9876500003 | Her dues, receipts, complaints    |

Any other number → new owner sign-up → property setup wizard.
`npm run reset-db` wipes the data folder (stop the server first); the next request re-seeds it.

## What's in v1

**Owner / manager panel** (`/owner`)
- Dashboard: "₹X pending from N people" + one-tap *Remind all*, overdue, proofs to confirm, bed status
  counts, defaulters, open complaints (48h+ flagged), check-ins/outs in the next 7 days, property switcher.
- Setup wizard: "3 floors × 5 rooms, double sharing, ₹8,000" → every room and bed in one step. Add rooms later.
- Colour-coded bed grid (vacant / occupied / reserved / on notice / maintenance).
- Residents: add from a vacant bed (first month prorated), WhatsApp/SMS invite, KYC upload + verify,
  room shift with history, notice → final settlement (deposit − dues − deductions) with printable slip.
- Rent: monthly invoice generation, record cash/UPI/bank in two taps, partial payments, confirm residents'
  payment screenshots, split a room's electricity bill, apply late fees, reminders, CSV export.
- Complaints: assign, prioritise, Open → In progress → Resolved → Closed; resident notified each step.
- Notices (per property or all, pinned), managers with per-property access, activity log.

**Resident portal** (`/me`)
- Phone + OTP login; first-login onboarding (emergency contact, ID upload, accept house rules).
- Home: amount due, breakdown, due date, **Pay now**; notices; complaint status; updates.
- Online payment (test mode) with instant receipt; upload proof for outside payments.
- Payment history, per-payment PDF receipts, date-range rent receipt for HRA.
- Raise complaints with photo, rate or reopen fixes. Room info, roommates, Wi-Fi, rules, contacts.
- Give move-out notice; account becomes read-only after settlement (receipts stay available).

**Security basics**: server-side role + property checks on every page, action and file; every table
is scoped by `owner_id`; KYC/bill files live outside `public/` and are served only through an
access-checked route; httpOnly session cookies; OTP attempts limited.

## Stubbed for v1 — where to plug in the real thing

| Area              | v1 behaviour                                  | Replace in                          |
|-------------------|-----------------------------------------------|-------------------------------------|
| OTP delivery      | Shown on screen in dev, logged to console     | `lib/notify.ts` → `sendOtp` (MSG91) |
| WhatsApp/SMS/push | Stored as in-app notifications + console log  | `lib/notify.ts` → `notify`          |
| Payment gateway   | Simulated "test mode" checkout                | `app/me/actions.ts` → `payOnlineAction` (Razorpay order + webhook) |
| PDFs              | Print-friendly pages → browser "Save as PDF"  | server-side PDF if needed           |
| File storage      | Private local folder `data/uploads`           | `lib/files.ts` → S3/Supabase private bucket + signed URLs |
| Scheduled jobs    | "Generate invoices" / "Remind" buttons        | cron calling `generateInvoices()` on billing day + reminder schedule |
| Database          | SQLite (`node:sqlite`)                        | port `SCHEMA` in `lib/db.ts` to Postgres |

## Not yet built (P1/P2 in the PRD)

Expenses & profit view, food menu & meal opt-out, visitor/leave log, enquiries & public property page,
reports beyond CSV, Excel import of residents, Hindi, polls, service worker/offline + push, DPDP data export tool.

## Code map

```
lib/db.ts          schema + SQLite helpers (multi-tenant by owner_id)
lib/seed.ts        demo data
lib/billing.ts     proration, invoices, payments, receipts
lib/residents.ts   check-in, reserve, notice, settlement, room shift
lib/auth.ts        OTP sessions, role + property access checks
app/owner/*        owner/manager panel (server components + server actions in actions.ts)
app/me/*           resident portal (actions in me/actions.ts)
app/receipt/[id]   printable receipt
```
