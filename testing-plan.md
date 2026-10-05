# BMT — Testing Plan

Structured plan for automated tests covering the three core flows (payment control, media settlement, bank statement import) plus the messages module (Gmail SMTP with an app password), history views and data tables.

Status: **proposal** — the open decisions below use the recommended defaults. Change them before starting the phases they affect.

---

## 0. Decisions (defaults assumed)

| # | Decision | Default | Affects |
|---|---|---|---|
| D1 | E-mail in tests | Add a transport seam: on DEVELOPMENT/PREVIEW (or `EMAIL_TRANSPORT=log`) skip SMTP and only write `email_logs` marked as suppressed. Real SMTP is verified only in production. | Phase 3, 5 |
| D2 | Media external sheet | Mock Sheets/Drive in integration tests (option a). One e2e on a dedicated trivial test template (option b) is optional and deferred. | Phase 2, 4 |
| D3 | Prod smoke | Dedicated read-only production account, runs automatically after each production deploy; also runnable manually. | Phase 5 |
| D4 | Documentation | One "Testing" section in `AGENTS.md` (imported by `CLAUDE.md`). npm scripts only; Claude slash command is optional (Phase 6). | Phase 6 |

Out of scope (deliberately not tested): the correctness of the Google Sheets calculation model itself (separate system), the visual layout of the "Nota obciążeniowa" (managed in the Google Sheets template), and real Gmail delivery on preview.

---

## 1. Current state (baseline)

- **Unit** (`vitest`, `__tests__/unit/`, run on pre-push and in `ci.yml`): `contracts`, `contracts.actions`, `csvParser`, `matcher`, `numberWords`.
- **E2E** (Playwright, `e2e/`, run by `.github/workflows/e2e.yml` on the Vercel preview after each successful deploy): `umowy`, `najemcy`, `nieruchomosci`, `media` (CRUD only). Data via fixtures in `e2e/support/fixtures.ts` with the `E2E_TEST__` prefix, cleanup in fixtures and `global-teardown.ts`.
- **Prod smoke**: only `/api/health`, not called by anything.
- **Not covered**: payment control, import, media settlement, messages, history, automations, settings.

Known risks to keep in mind while writing tests:
- Preview sends real e-mails (`lib/email.ts`: `finalTo = to`; `isPreview` only affects attachment storage). Current fixtures are safe only because tenants have no e-mail.
- `importBankStatement` writes the archive copy to `process.cwd()/data/attachments` (after the staging inserts), and `getFileContent` reads it from there. Vercel's filesystem is read-only, so on Vercel the import likely throws after the rows are already staged and leaves `audit_log.after_data` empty. Not yet reproduced on a deploy; fixed in Phase 3.1 (move to Supabase Storage). Production hosting is also unconfirmed (`vercel.json` crons vs. `deploy_vps*.js`) — the fix works on either.
- Server actions have the default 1 MB body limit (no `serverActions.bodySizeLimit` in `next.config.ts`); a base64 PDF statement can exceed it — check in Phase 3.1.
- The preview DB is shared between runs; tests must be isolated (unique names, `E2E_TEST__` prefix, mandatory cleanup).
- The virtual clock (`lib/clock.ts`, `app_config.time_offset_ms`) and the cron query overrides (`?month=&year=`, non-production only) are available for time-dependent tests.

---

## Phase 1 — Unit tests for pure/money logic (`npm run test:unit`)

Goal: fast checks for the numbers the tenant sees. Runs on pre-push and in CI.

Status: **done** (171 tests, ~1 s). New files in `__tests__/unit/`: `balance`, `statement`, `transactionStatus`, `rents`, `reminders`, `pdfParser`, plus the in-memory Supabase fake in `helpers/fakeSupabase.ts` (applies eq/in/not filters, unique keys → `23505`, upsert/insert/update/delete) — reuse it for new unit tests.

Finding: `getStatement` computes `isPaid` with a chronological credit pool, so an invoice dated the 1st is never "paid" by a payment made later (e.g. on the 5th). `isPaid` is not shown anywhere in the UI today, so the test documents the behaviour rather than changing it.

1. **Scripts**
   - [x] Add `test:unit` (alias of `vitest run` restricted to `__tests__/unit`), keep `test` pointing at it so the pre-push hook and `ci.yml` keep working.
2. **Balance and statement** (`lib/balance.ts`, `lib/statement.ts`)
   - [x] Mock `createServiceClient`; test balance = Σ(MATCHED + MANUAL) − Σ(invoices).
   - [x] Overpayment → positive, arrears → negative, zero.
   - [x] `REJECTED_*`, `SKIPPED`, `UNMATCHED` are excluded from the sum.
   - [x] Statement ordering and running balance.
3. **`lib/transactionStatus.ts`**
   - [x] `INCOME_TRANSACTION_STATUSES` contains exactly `MATCHED` and `MANUAL` (guards against the REJECTED_DUPLICATE regression).
   - [x] Every status has a label and a badge variant.
4. **Rents** (`lib/rents.ts`)
   - [x] Preview lists only active contracts of the right type.
   - [x] `generateRents` creates invoice records with `number: null`, no PDF, no e-mail (per the billing rules in `AGENTS.md`).
   - [x] Re-running for the same month does not duplicate (skipped count).
   - [x] `source` is recorded (`CRON` / `MANUAL` / `TEST_MANUAL`).
5. **Reminders** (`late-reminders`, `statement-reminder`, `meter-reading-reminder`)
   - [x] Eligibility rules with a fixed clock (use `getCurrentDate` mock).
   - [x] Dedup (`reminder_dedup` migration): the same reminder is not sent twice.
6. **Parsers**
   - [x] `pdfParser` (Millennium layout only — the parser supports just this one): `pdf-parse` is mocked with extracted text instead of a fixture PDF, so the line parsing, skipped (negative) rows, multi-line descriptions and header/footer filtering are covered; `parsePolishAmount` is covered through the amounts (not exported).
   - [ ] Extend `csvParser` and `matcher` tests with cases found during Phase 2 (suffix match, `PL` prefix, separators). Deferred until Phase 2 surfaces real cases.
7. **Acceptance**
   - [x] `npm run test:unit` green and < 15 s; pre-push still passes.

---

## Phase 2 — Integration tests for server actions (`npm run test:integration`)

Goal: verify business rules of the big server actions in seconds, without a browser. Server actions are called directly; `next/cache` (`revalidatePath`) is mocked; external boundaries are mocked; the DB is the real preview Supabase using `E2E_TEST__` data.

Status: **written, not yet run against a database** (as of 2026-10-01 the preview project in `.env.e2e` does not resolve in DNS — most likely paused by Supabase after a week of inactivity; `npm run test:integration` stops with that explanation). Verified so far: typecheck, lint, the no-DB `crons` suite (21 pass + 2 expected-fail), the production guard and the table-scoping wrapper. First real run will probably need small fixes — run `npm run test:integration` once the project is restored and `PRODUCTION_SUPABASE_REFS` is set in `.env.e2e`.

Design notes:
- Shared code lives in `tests-support/` (`db.ts` client + purge + leftovers count, `guard.ts`, `appConfig.ts`, `factories.ts`); `e2e/support/db.ts` re-exports it.
- `__tests__/integration/setup.ts` (runs before every file) replaces **nodemailer** (mails land in `mailbox`, nothing is sent), **Supabase Storage** (uploads land in `storage`) and wraps `createServiceClient` with a production re-check and `scopeTable()` — actions that read/delete whole tables (import, `dismissAllTransactions`, `sendBulkStatements`) only see `E2E_TEST__` rows, so real preview data is never touched. The suite runs with `VERCEL_ENV=preview` (subject prefix `[PREVIEW]`, `preview/` storage paths).
- `app_config` is one shared row: tests change it only via `applyAppConfig` / `patchAppConfigForSuite` (snapshot in `%TEMP%`, restored after the test; a crashed run is repaired by the next global setup).
- Cleanup deletes from `transactions` / `invoices`, which a DB trigger blocks unless `app_config.allow_destructive_test_deletes` is true; `tests-support/db.ts` flips it only when there is something to delete and restores it afterwards.
- Google layer (`sheetsEngine`, `driveEngine`) is mocked in `media-settlement.test.ts`; `generateRents` / reminder jobs are mocked in `crons.test.ts` (running them would write liabilities / send reminders for every real contract in the shared DB).

1. **Infrastructure**
   - [x] Add `vitest.integration.config.ts` (`include: ['__tests__/integration/**/*.test.ts']`, longer timeout, `dotenv` from `.env.e2e`, sequential or low parallelism).
   - [x] Add script `test:integration`.
   - [x] Reuse the DB helpers and factories from `e2e/support/` (extract shared parts into e.g. `tests-support/` so both Playwright and vitest use one implementation).
   - [x] Guard: refuse to run if `NEXT_PUBLIC_SUPABASE_URL` matches the production project. Implemented as `PRODUCTION_SUPABASE_REFS` (comma-separated project refs) in `.env.e2e`; **the run refuses to start when the variable is missing**, and every `createServiceClient()` call re-checks it.
   - [x] Global setup/teardown that deletes everything with the `E2E_TEST__` prefix (including staging rows, transactions, invoices, settlements created by tests).
2. **Import** (`importBankStatement`, `reconcileTransaction`, `reconcileMany`, `dismissTransaction`, `dismissAllTransactions`, `updateTransactionCategory`)
   - [x] CSV with a known tenant account → staging row with `suggested_tenant_id`.
   - [x] Unknown account → no suggestion.
   - [x] Account from `ignored_source_accounts` → auto-reject (`_auto_reject`), skipped rows stored as `REJECTED_OWN_TRANSFER`.
   - [x] Amount ≤ 0 → auto-reject.
   - [x] Re-import of the same file → staging dedup (skipped) and `is_duplicate` for already matched transactions.
   - [x] `dayFrom`/`dayTo` range trimming and the summary in `audit_log.after_data`.
   - [x] Reconcile → row moves to `transactions` (`MATCHED`), tenant balance changes; dismiss → rejected status, balance unchanged.
   - [x] Category update (`RENT` / `MEDIA`).
   - [ ] Archive copy (waits for the Phase 3.1 fix; until then `fs/promises` is mocked in `import.test.ts` so the test does not write into `data/attachments`): Storage upload is called with the `imports/` path and the tier prefix; a Storage failure does not break the import (`savedFileName: null`, rows still staged); the upload happens before any staging/transaction insert.
   - [ ] (Phase 3.1) `getFileContent` returns the text from Storage and `null` for a missing or legacy local file name.
3. **Payment control** (`kontrola-platnosci/actions.ts`)
   - [x] `getTenantsWithBalances` / `getTenantWithBalance` / `getGlobalPaymentStats` on a seeded scenario (rent 1000, payment 400 → −600).
   - [x] `sendStatementToTenant` / `sendBulkStatements` write `email_logs` (nodemailer mocked), skip tenants without e-mail, report errors.
4. **Media settlement** (`processSettlement`, with `sheetsEngine`, `driveEngine`, storage and nodemailer mocked)
   - [x] Happy path: `media_settlements` upsert, `invoices` with `number: null` and `media_settlement_id`, PDFs uploaded, tenant e-mail sent with the right attachments and recipients (`email` + `email2`).
   - [x] Negative amount → throws, no invoice created.
   - [x] Tenant without an active contract with `has_media_invoice` → expected error.
   - [x] Missing named ranges → expected error.
   - [x] Meter readings saved to `media_meter_readings` and returned as "previous" for the next month (`getPreviousMeterReadings`); overrides respected.
   - [x] Sheet error value (`#...`) → amount 0 handling.
   - [x] Admin summary e-mail is best-effort (failure does not fail the settlement).
   - [x] Re-running the same month/group is idempotent (`ignoreDuplicates`).
5. **Messages** (`wiadomosci/actions.ts` → `getEmailLogs`)
   - [x] Filters by date range and recipient.
6. **Crons** (route handlers with a mocked request)
   - [x] `generate-rents`: 401 without secret/cron header in production mode; month/year override only outside production; `source` mapping.
   - [x] `statement-reminder`, `meter-reading-reminder`: auth and happy path.
7. **Acceptance**
   - [ ] `npm run test:integration` green locally and leaves the DB clean (the count query in global teardown is implemented; needs a first run against a reachable DB).

---

Findings while writing Phase 2 (not fixed — separate decisions):
- **Cron auth hole:** `statement-reminder` and `meter-reading-reminder` compare the header with `` `Bearer ${process.env.CRON_SECRET}` ``; with `CRON_SECRET` unset, `Authorization: Bearer undefined` passes. Pinned by `test.fails` in `crons.test.ts` (it starts failing — remove the `.fails` — once the handlers reject a missing secret). `generate-rents` has the same comparison plus `NEXT_PUBLIC_ALLOW_TEST_PANEL=true` turns auth off completely.
- **`processSettlement` leaves partial state on validation errors:** the `media_settlements` row (and PDFs) are written before the negative-amount / missing-media-contract checks, so a failed run still makes `getSettlementForMonth` return `true` for that month. Invoices and e-mails are not created.
- **`processSettlement` ignores the result of the `invoices` upsert**, and `ignoreDuplicates` keeps the *first* amount — re-running a month with corrected readings does not update the liability (tenant e-mails are sent again, though).
- `types/supabase.ts` is stale (no `import_id` on `transactions` / `transaction_staging`); the code works around it with `as any`. Regenerate with `npm run db:types` when convenient.

## Phase 3 — E-mail seam and E2E acceptance tests (`npm run test:e2e:*`)

Goal: UI acceptance tests for each core flow on preview. Follow the pattern of `umowy.spec.ts` (fixtures create data directly in the DB, the browser exercises the UI).

1. **Spike / prerequisites**
   - [ ] **Reproduce first:** run a minimal import upload on preview and confirm the `data/attachments` write fails (expected: error shown to the user, staging rows present, `audit_log.after_data` empty). Note the observed error message in the PR.
   - [ ] **Fix: move the import archive copy to Supabase Storage** (real app bug, not a test problem; do this before writing the import spec):
     - [ ] New migration in `supabase/migrations` creating a private bucket `bank-statements` (model: `20260919120000_create_manual_uploads_bucket.sql`). Never create it manually in Studio.
     - [ ] `importBankStatement`: after parsing and **before** any staging/transaction inserts, upload the file (CSV text or PDF buffer) to `${tierPrefix}imports/${uuid}_${safeName}` via the service client. `tierPrefix` = `preview/` on preview, empty on production (same convention as `lib/email.ts`; use `getEnvTier`).
     - [ ] Keep `savedFileName` as the bare `uuid_safeName` so `upload-form.tsx`, `import-history-table.tsx` and `historia-importow/page.tsx` need no changes.
     - [ ] Storage failure is non-fatal: log it, set `savedFileName: null` in the summary (the UI already handles "no file" via `hasFile`). If strict archiving is preferred instead, abort the import with a clear error before any DB write — decide at implementation time.
     - [ ] Remove the `fs`/`path` usage from the import action; `data/attachments` is no longer written.
     - [ ] `getFileContent`: download from the bucket with the same prefix, return text; return `null` on miss (legacy records pointing at local files fall back to the existing "file removed" message).
     - [ ] PDF preview: stop reading PDFs as UTF-8; show "download only" or use a signed URL (pattern: `app/api/attachments/[filename]/route.ts`).
     - [ ] Check a real PDF statement size against the 1 MB server-action body limit; if exceeded, set `serverActions.bodySizeLimit` (Vercel cap is ~4.5 MB) or move the upload to a route handler.
     - [ ] E2E teardown (`global-teardown.ts`) removes Storage objects whose names contain `E2E_TEST__` (`preview/imports/`), in addition to DB rows.
     - [ ] Optional one-off: upload the existing local `data/attachments` files (dev data only) if the local import history should keep previews.
   - [ ] Implement the e-mail seam (D1) in `lib/email.ts`: when suppressed, skip `nodemailer`, still write `email_logs` with a `suppressed` marker (new migration in `supabase/migrations`, never manual SQL); subject keeps the `[PREVIEW]` prefix.
   - [ ] Add unit tests for the seam (suppressed vs. real path).
   - [ ] Add CSV/PDF fixture files under `e2e/fixtures/` with synthetic accounts and amounts (no real bank data).
   - [ ] Extend `e2e/support/fixtures.ts`: `makeTenantWithAccount`, `makeInvoice`, `makeTransaction`, `makeStagingRow`, `makeSettlementGroupWithOutputs`; extend `db.ts` cleanup and `global-teardown.ts` for the new tables.
   - [ ] Add missing `data-testid` attributes to tables/rows/buttons on the affected pages.
2. **`import.spec.ts`** (`npm run test:e2e:import`)
   - [ ] Upload a CSV → preview dialog → summary counts.
   - [ ] Staging list shows the suggested tenant; approve → appears in history and in the tenant's transactions.
   - [ ] Auto-rejected rows (own account, amount ≤ 0, duplicate) are flagged.
   - [ ] Re-upload of the same file creates no duplicates.
   - [ ] Reject, reject-all, manual reconcile of an unknown row, category change.
   - [ ] Import history (`/historia-importow`, `/import/history`) shows live statuses.
3. **`platnosci.spec.ts`** (`npm run test:e2e:payments`)
   - [ ] Seeded tenant with rent and partial payment → correct balance and "arrears" state on `/kontrola-platnosci`.
   - [ ] Overpayment, zero balance, rejected transactions excluded.
   - [ ] Global stats match the seeded data.
   - [ ] Manual transaction and adjustment from the tenant page change the balance.
   - [ ] Send statement → success toast and a suppressed `email_logs` row.
   - [ ] Text/facet filters.
4. **`wiadomosci.spec.ts`** (`npm run test:e2e:messages`)
   - [ ] Seeded `email_logs` rows are listed; date and recipient filters; clear filters.
   - [ ] Detail dialog shows body and attachments.
   - [ ] An e-mail triggered in the UI (e.g. statement) appears in the list.
5. **`rozlicz-media.spec.ts`** (`npm run test:e2e:media`) — only with the sheet layer stubbed or via the test template (D2)
   - [ ] Settlement page loads the group, previous readings are prefilled.
   - [ ] Validation errors (negative amount, tenant without media contract) surface in the UI.
   - [ ] (Optional, deferred) full run on the dedicated trivial template: invoices created, e-mail suppressed and logged, history (`/historia-mediow`, `/historia-obciazen`) updated.
6. **History and data views** (light coverage)
   - [ ] `historia`, `historia-obciazen`, `historia-mediow`, `baza-danych` load and filter seeded rows.
7. **Automations** (optional, uses the virtual clock)
   - [ ] Set the test clock on `/testowanie`, run the reminder test actions, assert `email_logs`; always reset the clock in teardown.
8. **Config and CI**
   - [ ] Add npm scripts: `test:e2e:import`, `test:e2e:payments`, `test:e2e:messages`, `test:e2e:media`.
   - [ ] Keep `e2e.yml` running the whole suite on preview; set `retries: 1` in CI only if flakiness appears (currently 0).

---

## Phase 4 — Optional: media end-to-end against a real test template

Only if the Google integration breaks unnoticed, or before changing the sheet engine.

- [ ] Create a dedicated Google Sheet with named ranges and trivial formulas (`out = in * 2`) in a test Drive folder, shared with the service account.
- [ ] Add a settlement group fixture that points to it.
- [ ] One spec that runs the full `processSettlement` and asserts invoices, the stored PDF and a suppressed e-mail log.
- [ ] Clean up the copied spreadsheet and Storage PDFs afterwards (Drive file ids from `media_settlements`).
- [ ] Tag `@google` and run separately (`npm run test:e2e:google`), not on every deploy.

---

## Phase 5 — Production smoke tests (`npm run test:smoke`)

Goal: confirm a production deploy is alive without mutating anything.

1. **Setup**
   - [ ] Create a read-only production user for the smoke run; store credentials as GitHub secrets (`SMOKE_BASE_URL`, `SMOKE_LOGIN_EMAIL`, `SMOKE_LOGIN_PASSWORD`).
   - [ ] Add `e2e-smoke/` (or `@smoke` tag) and a Playwright project `smoke` with its own auth setup and **no** `global-teardown` and **no** DB service key.
2. **Checks**
   - [ ] `/api/health` returns `ok`.
   - [ ] Login works; unauthenticated access redirects to `/login`.
   - [ ] Each main page renders without an error state: `/`, `/kontrola-platnosci`, `/import`, `/media`, `/rozlicz-media`, `/wiadomosci`, `/historia`, `/najemcy`, `/umowy`, `/nieruchomosci`.
   - [ ] Cron endpoints return 401 without credentials (they are **not** executed).
   - [ ] SMTP credentials check without sending (connection verify via a read-only endpoint/action — part of D1).
   - [ ] The test panel/virtual clock is inactive in production (offset treated as 0).
3. **Automation**
   - [ ] Add `.github/workflows/smoke.yml` on `deployment_status` for the **Production** environment, plus `workflow_dispatch`.
   - [ ] Optionally run it on a schedule (e.g. daily) to detect expired credentials/API keys.
   - [ ] Failure notification (GitHub default, or e-mail to the admin).

---

## Phase 6 — Commands and documentation

1. **npm scripts (final set)**
   - [ ] `test:unit`, `test:integration`, `test:e2e`, `test:e2e:import`, `test:e2e:payments`, `test:e2e:messages`, `test:e2e:media`, `test:smoke`, `test:all` (unit + integration; e2e and smoke need their own environment).
2. **`AGENTS.md`** (imported by `CLAUDE.md`)
   - [ ] Add a single "Testing" section: the layers, what runs where (pre-push, CI, preview, production), the commands above, data isolation rules, the e-mail suppression rule, and what is deliberately not tested.
   - [ ] Replace the outdated "run locally against preview" wording in the e2e section (the README says GitHub Actions).
   - [ ] Update the "Currently implemented coverage" list as each spec lands.
3. **`e2e/README.md`**
   - [ ] Update covered/uncovered lists, new fixtures, new secrets, how to run a single flow.
4. **Optional**
   - [ ] Claude slash command / skill (e.g. `/test-flow <payments|import|media|messages|smoke>`) that runs the matching script and summarizes failures.
5. **CI**
   - [ ] `ci.yml`: add `test:integration` only if it can run safely with secrets on pull requests; otherwise keep it local/pre-merge.
   - [ ] Update `.husky/pre-push` only if the integration suite proves fast and stable enough.

---

## Suggested execution order

1. Phase 1 (unit tests for money logic) — no infrastructure needed.
2. Phase 2.1–2.2 (integration infrastructure + import) and the 3.1 attachment fix (reproduce → Storage bucket migration → code change) in parallel; the import integration tests for the archive copy land together with the fix.
3. Phase 2.3–2.5 (payment control, media, messages) — integration level.
4. Phase 3.1 seam → Phase 3.2–3.4 (import → payments → messages e2e).
5. Phase 3.5–3.8 (media e2e with stubs, history, config).
6. Phase 5 (prod smoke).
7. Phase 6 documentation, updated incrementally after every phase; Phase 4 only on demand.

## Definition of done (whole plan)

- Each of the three core flows and the messages module has unit/integration coverage of its business rules and at least one e2e acceptance path on preview.
- No test sends a real e-mail or touches real tenant data.
- `npm run test:all` and the single-flow commands work and are documented in `AGENTS.md`.
- Production is verified after every deploy by a read-only smoke run.
