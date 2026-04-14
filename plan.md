# webapp-template — plan budowy

Baza pod każdy przyszły projekt SaaS/webapp. Deploy w 10 minut po podaniu kluczy.

---

## Stack

| Warstwa       | Technologia                        |
|---------------|------------------------------------|
| Framework     | Next.js 15 (App Router)            |
| Język         | TypeScript                         |
| Styling       | Tailwind CSS v4 + shadcn/ui        |
| Baza danych   | Supabase (PostgreSQL) — opcjonalna |
| Auth          | Supabase Auth — opcjonalna         |
| Płatności     | Stripe (subskrypcje + one-time)    |
| Email         | Resend                             |
| Hosting       | Vercel                             |
| CI/CD         | GitHub Actions + Vercel            |

---

## Struktura projektu

```
webapp-template/
├── app/
│   ├── page.tsx                        # strona główna — instrukcja konfiguracji
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── webhooks/
│       │   └── stripe/
│       │       └── route.ts            # obsługa zdarzeń Stripe
│       └── health/
│           └── route.ts                # healthcheck endpoint
├── components/
│   └── ui/                             # shadcn/ui komponenty
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # browser client
│   │   ├── server.ts                   # server client (RSC/actions)
│   │   └── middleware.ts               # session refresh
│   ├── stripe/
│   │   ├── client.ts                   # Stripe SDK instance
│   │   └── webhooks.ts                 # handlery zdarzeń (checkout, subscription)
│   └── resend/
│       ├── client.ts                   # Resend SDK instance
│       └── emails/
│           └── welcome.tsx             # przykładowy email (React Email)
├── middleware.ts                       # route protection (gdy Supabase aktywne)
├── types/
│   ├── supabase.ts                     # generowane typy z Supabase CLI
│   └── stripe.ts
├── .env.example                        # wszystkie zmienne z opisem
├── .github/
│   └── workflows/
│       └── ci.yml                      # lint + typecheck + build na PR
└── supabase/
    └── migrations/                     # migracje SQL (gdy Supabase aktywne)
```

---

## Zmienne środowiskowe (`.env.example`)

```bash
# === APP ===
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === SUPABASE (opcjonalne — usuń jeśli nie używasz bazy) ===
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# === STRIPE ===
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
# Opcjonalnie — ID produktu/ceny jeśli masz gotowy plan
STRIPE_PRICE_ID=

# === RESEND ===
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@twojadomena.com
```

---

## Strona główna (`/`)

Prosta strona z instrukcją krok po kroku co skonfigurować przed startem projektu:

1. Sklonuj repo + `npm install`
2. Skopiuj `.env.example` → `.env.local` i uzupełnij klucze
3. (opcjonalnie) Supabase: utwórz projekt, wklej URL + klucze, uruchom migracje
4. Stripe: utwórz produkt/cenę w Dashboard, wklej klucze, skonfiguruj webhook
5. Resend: zweryfikuj domenę, wklej klucz API
6. Push na GitHub → Vercel auto-deploy
7. W Vercel dodaj te same zmienne środowiskowe

Gdy zaczynasz nowy projekt, po prostu nadpisujesz `app/page.tsx` swoją własną landing page.

---

## Stripe — co jest gotowe

- `lib/stripe/client.ts` — singleton Stripe SDK
- `app/api/webhooks/stripe/route.ts` — weryfikacja podpisu + routing zdarzeń
- Obsługiwane zdarzenia od razu:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Helper do tworzenia Checkout Session (one-time i subscription)
- Helper do tworzenia Customer Portal session

---

## Supabase — co jest gotowe

- Browser + server client (cookies-based, zgodny z App Router)
- `middleware.ts` odświeżający sesję na każdym request
- Przykładowa migracja: tabela `profiles` linkowana do `auth.users`
- Supabase CLI skonfigurowany (`supabase/config.toml`)
- Generowanie typów: `npm run db:types`

Jeśli projekt nie potrzebuje bazy — po prostu nie uzupełniasz zmiennych Supabase i middleware jest no-op.

---

## CI/CD

### GitHub Actions (`.github/workflows/ci.yml`)
Uruchamia się na każdy PR i push do `main`:
1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build`

### Vercel
- Auto-deploy na push do `main` → **production**
- Auto-deploy na PR → **preview URL**
- Zmienne środowiskowe ustawiane raz w Vercel Dashboard

---

## Komendy npm

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "db:types": "supabase gen types typescript --local > types/supabase.ts",
  "db:push": "supabase db push",
  "stripe:listen": "stripe listen --forward-to localhost:3000/api/webhooks/stripe"
}
```

---

## Konta które trzeba założyć

| Serwis     | Po co                              | Link                        |
|------------|------------------------------------|-----------------------------|
| GitHub     | repo + CI/CD                       | github.com                  |
| Vercel     | hosting + preview deploys          | vercel.com                  |
| Stripe     | płatności + webhook                | stripe.com                  |
| Supabase   | baza danych + auth (opcjonalnie)   | supabase.com                |
| Resend     | wysyłanie maili                    | resend.com                  |

---

## Gdzie wpisać klucze

### Lokalnie (development)
Plik `.env.local` w katalogu głównym projektu — **nigdy nie commituj tego pliku** (jest w `.gitignore`).

### Produkcja — Vercel
Vercel Dashboard → projekt → **Settings → Environment Variables**
Dodajesz każdą zmienną z `.env.example` z prawdziwymi wartościami.
Vercel wstrzykuje je automatycznie przy każdym buildzie.

### Skąd wziąć poszczególne klucze

**Supabase:**
- Dashboard → projekt → Settings → API
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`

**Stripe:**
- Dashboard → Developers → API keys
- `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET` → Developers → Webhooks → dodaj endpoint `https://twojadomena.com/api/webhooks/stripe` → skopiuj signing secret
- Lokalnie zamiast webhooków użyj `npm run stripe:listen`

**Resend:**
- Dashboard → API Keys → Create API Key
- `RESEND_API_KEY`
- Dodatkowo zweryfikuj domenę w Resend (DNS) żeby maile nie trafiały do spamu

---

## Kolejność implementacji

### Krok 1 — Init projektu
- [x] 1.1 `npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"`
- [x] 1.2 Zainstalować dodatkowe zależności: `@supabase/supabase-js @supabase/ssr stripe resend @react-email/components`
- [x] 1.3 Zainstalować shadcn/ui: `npx shadcn@latest init`
- [x] 1.4 Dodać kilka bazowych komponentów shadcn: `button`, `badge`, `card`

### Krok 2 — Zmienne środowiskowe
- [x] 2.1 Stworzyć `.env.example` z wszystkimi zmiennymi (APP, Supabase, Stripe, Resend)
- [x] 2.2 Dodać `.env.local` do `.gitignore` (powinno być automatycznie, sprawdzić)

### Krok 3 — Supabase
- [x] 3.1 Stworzyć `lib/supabase/client.ts` — browser client
- [x] 3.2 Stworzyć `lib/supabase/server.ts` — server client (RSC + Server Actions)
- [x] 3.3 Stworzyć `lib/supabase/middleware.ts` — helper odświeżający sesję
- [x] 3.4 Stworzyć `middleware.ts` w root — używa lib/supabase/middleware, no-op gdy brak kluczy
- [x] 3.5 Stworzyć `supabase/migrations/0001_profiles.sql` — przykładowa migracja
- [x] 3.6 Stworzyć `types/supabase.ts` — placeholder na generowane typy

### Krok 4 — Stripe
- [x] 4.1 Stworzyć `lib/stripe/client.ts` — singleton Stripe SDK
- [x] 4.2 Stworzyć `lib/stripe/helpers.ts` — `createCheckoutSession()`, `createPortalSession()`
- [x] 4.3 Stworzyć `app/api/webhooks/stripe/route.ts` — weryfikacja podpisu + routing zdarzeń
- [x] 4.4 Stworzyć `types/stripe.ts` — typy dla zdarzeń webhook

### Krok 5 — Resend
- [x] 5.1 Stworzyć `lib/resend/client.ts` — singleton Resend SDK
- [x] 5.2 Stworzyć `lib/resend/emails/welcome.tsx` — przykładowy email w React Email
- [x] 5.3 Stworzyć `lib/resend/send.ts` — helper `sendWelcomeEmail()`

### Krok 6 — Strona główna
- [x] 6.1 Zaktualizować `app/layout.tsx` — meta, fonts, podstawowy layout
- [x] 6.2 Napisać `app/page.tsx` — instrukcja setup z krokami konfiguracji
- [x] 6.3 Stworzyć `app/api/health/route.ts` — `{ status: "ok", timestamp }`

### Krok 7 — CI/CD
- [x] 7.1 Stworzyć `.github/workflows/ci.yml` — lint + typecheck + build na PR/push

### Krok 8 — README
- [x] 8.1 Napisać `README.md` — stack, setup w 5 minutach, komendy, struktura

### Krok 9 — Vercel env sync
- [x] 9.1 Dodać `VERCEL_ACCESS_TOKEN` + `VERCEL_PROJECT_ID` + `VERCEL_TEAM_ID` (opcjonalne) do `.env.example`
- [x] 9.2 Stworzyć `scripts/vercel-env-push.ts` — skrypt czytający `.env.local` i pushujący każdą zmienną przez Vercel API (`POST /v10/projects/{id}/env`) dla środowisk `production`, `preview`, `development`
- [x] 9.3 Dodać komendę `"vercel:env": "tsx scripts/vercel-env-push.ts"` do `package.json`
- [x] 9.4 Zainstalować `tsx` jako devDependency (runtime dla skryptu TS bez budowania)
