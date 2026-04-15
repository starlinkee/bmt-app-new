# BMT — Zarządzanie nieruchomościami

Aplikacja do zarządzania wynajmem nieruchomości. Single-tenant, jeden admin.

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
3. Utwórz konto admina: **Authentication → Users → Add user** — wpisz te same dane co `APP_ADMIN_EMAIL` + `APP_PASSWORD`
4. Zainstaluj [Supabase CLI](https://supabase.com/docs/guides/cli) (Windows: `winget install Supabase.CLI`)
5. Połącz z projektem i wgraj migrację:
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   ```

### 2. Resend (e-maile)

Wklej do `.env.local`:
```
RESEND_API_KEY=re_...
RESEND_FROM=BMT <noreply@twojadomena.com>
RESEND_REPLY_TO=twoj@email.com
```

> Zweryfikuj domenę w Resend (Settings → Domains) żeby maile nie trafiały do spamu.

### 3. Google Sheets (faktury PDF)

1. W [Google Cloud Console](https://console.cloud.google.com) włącz **Google Sheets API** i **Google Drive API**
2. **Service Account** (dla Sheets):
   - IAM & Admin → Service Accounts → klucz JSON → zakoduj base64:
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("klucz.json"))
     ```
   - Wklej wynik jako `GOOGLE_SERVICE_ACCOUNT_JSON`
3. **OAuth2** (dla Drive):
   - Credentials → OAuth2 Client ID → wklej `GOOGLE_OAUTH_CLIENT_ID` i `GOOGLE_OAUTH_CLIENT_SECRET`
   - Refresh token wygeneruj przez [OAuth Playground](https://developers.google.com/oauthplayground) → wklej jako `GOOGLE_OAUTH_REFRESH_TOKEN`

### 4. Cron (automatyczne przypomnienia)

Aplikacja używa [cron-job.org](https://cron-job.org) zamiast Vercel Cron (plan Hobby nie obsługuje harmonogramów częstszych niż raz dziennie).

1. Załóż konto na cron-job.org
2. Utwórz nowy cronjob:
   - **URL**: `https://twoja-domena.vercel.app/api/cron/reminders`
   - **Schedule**: co godzinę (Every hour, minute 0)
   - **Headers**: `Authorization: Bearer <wartość CRON_SECRET>`
3. Wygeneruj `CRON_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

> Przy zmianie domeny Vercel zaktualizuj URL w cron-job.org — nagłówek i harmonogram zostają bez zmian.

### 5. Deploy na Vercel

```bash
npx vercel login
npx vercel --prod
```

Po deployu ustaw wszystkie zmienne z `.env.local` w **Vercel Dashboard → Settings → Environment Variables**.

Następnie zaktualizuj `NEXT_PUBLIC_APP_URL` na docelową domenę i ponów deploy.

---

## Zmienne środowiskowe

| Zmienna | Opis |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL z Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Klucz publiczny (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Klucz serwera (tajny, bypass RLS) |
| `APP_ADMIN_EMAIL` | E-mail konta admina w Supabase Auth |
| `APP_PASSWORD` | Hasło konta admina |
| `RESEND_API_KEY` | Klucz API Resend |
| `RESEND_FROM` | Nadawca e-maili, np. `BMT <noreply@domena.pl>` |
| `RESEND_REPLY_TO` | Adres odpowiedzi |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON Service Account (base64 lub raw) |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth2 Client ID (Drive) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth2 Client Secret (Drive) |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | OAuth2 Refresh Token (Drive) |
| `CRON_SECRET` | Sekret autoryzacji crona |
| `NEXT_PUBLIC_APP_URL` | Publiczny URL aplikacji |

---

## Komendy

| Komenda | Co robi |
|---|---|
| `npm run dev` | serwer deweloperski |
| `npm run build` | build produkcyjny |
| `npm run typecheck` | sprawdzenie typów TypeScript |
| `npm run db:push` | push migracji do Supabase |
| `npm run db:types` | generowanie typów z Supabase |
| `npm run db:migrate` | push migracji + generowanie typów |

---

## Stack

| Warstwa | Technologia |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Baza danych | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email+password) |
| Email | Resend |
| Arkusze / PDF | Google Sheets API v4 (Service Account) |
| Drive | Google Drive API v3 (OAuth2) |
| Cron | cron-job.org |
| Hosting | Vercel |
