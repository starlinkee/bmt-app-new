# BMT — Zarządzanie nieruchomościami

Aplikacja do zarządzania wynajmem nieruchomości. Single-tenant, jeden admin.

Pełny opis funkcji i modelu danych: [functionality.md](functionality.md). Zasady rozliczeń (czynsze vs media) i zmian schematu bazy: [AGENTS.md](AGENTS.md). Testy: [testing-plan.md](testing-plan.md), [e2e/README.md](e2e/README.md).

---

## Quickstart

```bash
npm install
cp .env.example .env.local
# uzupełnij .env.local kluczami (patrz niżej)
npm run dev
```

---

## Setup krok po kroku

### 1. Supabase

1. Utwórz projekt na [supabase.com](https://supabase.com)
2. Wklej do `.env.local` klucze z **Settings → API**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```
3. Utwórz konto admina: **Authentication → Users → Add user** (e-mail + hasło, którymi będziesz się logować)
4. Zainstaluj [Supabase CLI](https://supabase.com/docs/guides/cli) (Windows: `winget install Supabase.CLI`)
5. Połącz z projektem i wgraj migracje:
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   ```

### 2. E-maile (Gmail SMTP)

Aplikacja wysyła e-maile przez Gmail SMTP (`nodemailer`). Nadawcą jest adres administratora ustawiony w aplikacji (**Ustawienia → adres administratora**), a hasło aplikacji Gmail podajesz w env:

```
GMAIL_APP_PASSWORD=
```

> Hasło aplikacji wygenerujesz w koncie Google (Zabezpieczenia → Hasła aplikacji; wymaga włączonej weryfikacji dwuetapowej). Bez adresu administratora lub hasła wysyłka kończy się błędem.
> Poza produkcją (`DEVELOPMENT`/`PREVIEW`) temat e-maila dostaje prefiks `[DEVELOPMENT]`/`[PREVIEW]`, ale e-maile **są wysyłane naprawdę** — nie wpisuj prawdziwych adresów najemców do baz dev/preview.

### 3. Google Sheets i Drive (rozliczanie mediów)

Google służy do rozliczania **mediów** (noty obciążeniowe). Czynsze nie generują PDF-ów ani e-maili.

1. W [Google Cloud Console](https://console.cloud.google.com) włącz **Google Sheets API** i **Google Drive API**
2. **Service Account** (dla Sheets):
   - IAM & Admin → Service Accounts → klucz JSON → zakoduj base64:
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("klucz.json"))
     ```
   - Wklej wynik jako `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Udostępnij arkusze-szablony (i folder na Drive) kontu serwisowemu
3. **OAuth2** (dla Drive):
   - Credentials → OAuth2 Client ID → wklej `GOOGLE_OAUTH_CLIENT_ID` i `GOOGLE_OAUTH_CLIENT_SECRET`
   - Refresh token wygeneruj przez [OAuth Playground](https://developers.google.com/oauthplayground) → wklej jako `GOOGLE_OAUTH_REFRESH_TOKEN`

### 4. Cron (automatyzacje)

Crony są zdefiniowane w `vercel.json` i uruchamiane przez Vercel Cron (nagłówek `x-vercel-cron: 1`):

| Endpoint | Harmonogram | Co robi |
|---|---|---|
| `/api/cron/generate-rents` | 1. dnia miesiąca, 08:00 | tworzy obciążenia za czynsz (bez e-maili) |
| `/api/cron/statement-reminder` | codziennie 08:00 | 16. dnia miesiąca przypomina adminowi o wgraniu wyciągu |
| `/api/cron/meter-reading-reminder` | codziennie 08:00 | w ostatnim dniu miesiąca wysyła najemcom link do formularza odczytów |

Endpointy można też wywołać ręcznie z nagłówkiem `Authorization: Bearer <CRON_SECRET>`. Wygeneruj sekret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Szczegóły i ograniczenia: [functionality.md](functionality.md#automatyzacje-i-crony).

### 5. Deploy na Vercel

Projekt jest podpięty do Vercela. Zmienne z `.env.local` ustaw w **Vercel Dashboard → Settings → Environment Variables** (osobno dla Production i Preview; skrypt `npm run vercel:env` pomaga je wypchnąć). `NEXT_PUBLIC_APP_URL` musi wskazywać docelową domenę (używany w linkach e-mail).

Migracje bazy puszcza automatycznie `npm run vercel-build` (`scripts/vercel-build.mjs`) przy użyciu `SUPABASE_DB_URL` — ustaw ją w Vercelu dla każdego środowiska.

**Droga na produkcję:** `scripts/push-preview.sh` (db push na bazę dev → commit/push → testy jednostkowe → e2e na deployu preview → PR `dev → master`, merge ręcznie). Bezpośredni push do `master` jest niedozwolony.

---

## Zmienne środowiskowe

| Zmienna | Opis |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL z Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Klucz publiczny (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Klucz serwera (tajny, bypass RLS) |
| `SUPABASE_DB_URL` | Connection string do `supabase db push` |
| `GMAIL_APP_PASSWORD` | Hasło aplikacji Gmail (nadawca = adres admina z Ustawień) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON Service Account (base64 lub raw) |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth2 Client ID (Drive) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth2 Client Secret (Drive) |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | OAuth2 Refresh Token (Drive) |
| `CRON_SECRET` | Sekret autoryzacji crona |
| `NEXT_PUBLIC_APP_URL` | Publiczny URL aplikacji |
| `NEXT_PUBLIC_ALLOW_TEST_PANEL` | (opcjonalnie) `true` włącza panel testowy poza dev/preview |
| `SKILL_RUNNER_URL`, `SKILL_RUNNER_TOKEN` | (opcjonalnie) skill runner na VPS |

Wzór: `.env.example`. Zmienne do testów e2e/integracyjnych: `.env.e2e.example`, patrz `e2e/README.md`.

---

## Komendy

| Komenda | Co robi |
|---|---|
| `npm run dev` | serwer deweloperski |
| `npm run build` / `npm run vercel-build` | build produkcyjny / build z migracjami (Vercel) |
| `npm run lint` / `npm run typecheck` | ESLint / sprawdzenie typów |
| `npm run test` (`test:unit`) | testy jednostkowe (vitest) |
| `npm run test:integration` | testy integracyjne server actions (baza preview, `.env.e2e`) |
| `npm run test:e2e` | testy Playwright (przeciwko deployowi preview) |
| `npm run db:push` | push migracji do bazy z `SUPABASE_DB_URL` + typy (skrypt pod Windows/PowerShell) |
| `npm run db:push:preview` / `db:push:prod` | push migracji na preview / produkcję |
| `npm run db:types` | generowanie typów z Supabase |
| `npm run vercel:env` | wypchnięcie zmiennych środowiskowych do Vercela |

---

## Stack

| Warstwa | Technologia |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Baza danych | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email+hasło, jeden admin) |
| Email | Gmail SMTP (`nodemailer`) |
| Arkusze / PDF (media) | Google Sheets API v4 (Service Account) |
| Drive | Google Drive API v3 (OAuth2) |
| Cron | Vercel Cron (`vercel.json`) |
| Hosting | Vercel |
