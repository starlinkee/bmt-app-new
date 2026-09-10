<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:bmt-billing-rules -->
# BMT Billing & Invoicing Rules

1. **Czynsze (Rents)**: We DO NOT generate formal invoices (PDFs) or send emails for rent in this system. The `generateRents` cron job should ONLY create a database record in the `invoices` table (with `number: null`) to track the liability/debt for the tenant's balance. Formal invoicing is handled in an external accounting system.

2. **Media (Noty obciążeniowe)**: Media generation DOES use Google Sheets to calculate amounts and export a PDF. We use this mechanism to generate "Noty obciążeniowe". The visual layout of the "Nota obciążeniowa" is entirely managed in the Google Sheets template linked in the App Settings. The codebase simply copies the sheet, fills the values, and emails the PDF. Do not write custom PDF generation code for Media. (NOTE: This template design is temporary and needs to be completed/updated soon, as soon as the exact requirements for its layout are known).
<!-- END:bmt-billing-rules -->

<!-- BEGIN:bmt-db-migrations-rules -->
# Zasady zmian schematu bazy danych (Supabase)

Zmiany schematu bazy **zawsze** idą przez plik migracji w `supabase/migrations`, nigdy przez ręczne SQL odpalone w Supabase Studio (SQL Editor) — nawet "szybka poprawka" czy test.

Dlaczego to krytyczne: `supabase db push` śledzi historię zastosowanych migracji per baza. Jeśli obiekt (kolumna, tabela, polityka) powstanie ręcznie poza tym mechanizmem, historia migracji się rozjeżdża — kolejny `db push` wywala się błędem w stylu "column/policy already exists" (SQLSTATE 42701/42710/42P07), bo próbuje ponownie zastosować migrację, która "zdaniem" bazy nigdy nie poszła. To trzeba wtedy ręcznie naprawiać przez `supabase migration repair --status applied <version>` zanim push znów zadziała.

To ma teraz realne konsekwencje deployowe: `npm run vercel-build` (zob. `scripts/vercel-build.mjs`) puszcza migracje jako **krok builda na Vercelu** — rozjazd blokuje nie tylko lokalny push, ale cały deploy produkcji/preview.

Jeśli mimo wszystko ktoś zmieni coś ręcznie w Studio: jak najszybciej dopisz odpowiadającą migrację w `supabase/migrations` i napraw historię przez `migration repair`, zamiast zostawiać rozjazd do wykrycia przy następnym deployu.
<!-- END:bmt-db-migrations-rules -->

<!-- BEGIN:bmt-todos -->
# TODOs / Reminders

Brak aktywnych przypomnień na ten moment.
<!-- END:bmt-todos -->
