# webapp-template

Baza pod każdy projekt SaaS/webapp. Deploy w 10 minut po podaniu kluczy.

---

## Quickstart — od zera do działającego projektu

### 1. Instalacja

```bash
npm install
npm run dev
```

Otwórz `http://localhost:3000` — powinieneś zobaczyć stronę setup.
Sprawdź też healthcheck: `curl http://localhost:3000/api/health`

### 2. Stripe

1. Wejdź w **Developers → API keys** na stripe.com i wklej do `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
2. Zainstaluj [Stripe CLI](https://stripe.com/docs/stripe-cli), zaloguj się: `stripe login`
3. W osobnym terminalu uruchom:
   ```bash
   npm run stripe:listen
   ```
   CLI wypisze `webhook signing secret: whsec_...` — wklej go jako `STRIPE_WEBHOOK_SECRET`
4. Zrestartuj `npm run dev`

### 3. Resend

Wklej do `.env.local`:
```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=onboarding@resend.dev
```

> `onboarding@resend.dev` to adres testowy Resend — działa bez weryfikacji domeny.
> Na produkcji zamień na własną zweryfikowaną domenę.

### 4. Supabase (opcjonalne)

1. Wklej do `.env.local` klucze z **Settings → API** na supabase.com
2. Zainstaluj [Supabase CLI](https://supabase.com/docs/guides/cli), zaloguj się: `supabase login`
3. Połącz z projektem: `supabase link --project-ref <twoj-ref>`
4. Zastosuj przykładową migrację i wygeneruj typy:
   ```bash
   npm run db:migrate
   ```

### 5. Deploy na Vercel

1. Utwórz projekt na vercel.com (importuj z GitHub)
2. Wygeneruj token w **Settings → Tokens**, wklej do `.env.local`:
   ```
   VERCEL_ACCESS_TOKEN=...
   VERCEL_PROJECT_ID=...
   ```
3. Wypchnij wszystkie klucze do Vercel jedną komendą:
   ```bash
   npm run vercel:env
   ```
4. Zrób deploy:
   ```bash
   git push origin master
   ```

### Minimalne "działa"

| Co chcesz sprawdzić | Wymagane kroki |
|---|---|
| Strona się odpala | tylko krok 1 |
| Stripe webhooki | 1 + 2 |
| Wysyłanie maili | 1 + 3 |
| Baza danych | 1 + 4 |
| Produkcja na Vercel | wszystkie |

---

## Stack

| Warstwa     | Technologia                        |
|-------------|------------------------------------|
| Framework   | Next.js 16 (App Router)            |
| Język       | TypeScript                         |
| Styling     | Tailwind CSS v4 + shadcn/ui        |
| Baza danych | Supabase (PostgreSQL) — opcjonalna |
| Auth        | Supabase Auth — opcjonalna         |
| Płatności   | Stripe (subskrypcje + one-time)    |
| Email       | Resend + React Email               |
| Hosting     | Vercel                             |
| CI/CD       | GitHub Actions + Vercel            |

---

## Pierwszy setup (raz na nowy projekt)

### 1. Sklonuj i zainstaluj

```bash
git clone <repo-url> moj-projekt
cd moj-projekt
npm install
```

### 2. Uzupełnij zmienne środowiskowe

```bash
cp .env.example .env.local
```

Otwórz `.env.local` i wklej klucze. Skąd je wziąć — patrz sekcja
[Skąd wziąć klucze](#skąd-wziąć-klucze) poniżej.

### 3. Wypchnij klucze do Vercel

```bash
npm run vercel:env
```

Skrypt czyta `.env.local` i przez Vercel API ustawia wszystkie zmienne
w twoim projekcie Vercel (środowiska: production, preview, development).
Rób to każdorazowo gdy zmienisz wartość jakiegoś klucza.

> `.env.local` jest w `.gitignore` — nigdy nie trafia do repozytorium.
> Vercel nie ma dostępu do twojego pliku, tylko do tego co wyślesz przez ten skrypt.

### 4. Deploy

```bash
git push origin master
```

Vercel wykrywa push i automatycznie deployuje. Zmienne już są ustawione
(krok 3), więc build działa od razu.

---

## Codzienna praca

### Development lokalny

```bash
npm run dev
```

Next.js automatycznie czyta `.env.local`. Nie musisz nic robić.

### Testowanie webhooków Stripe lokalnie

```bash
npm run stripe:listen
```

Stripe CLI przekierowuje zdarzenia na `localhost:3000/api/webhooks/stripe`.
Potrzebuje zainstalowanego [Stripe CLI](https://stripe.com/docs/stripe-cli).

---

## Praca z bazą danych (Supabase)

Jeśli nie używasz bazy — pomiń tę sekcję. Middleware i klienty Supabase
są no-op gdy klucze nie są ustawione.

### Zmiana schematu bazy

Kiedy chcesz dodać lub zmienić tabelę:

**1. Napisz plik migracji**

Utwórz plik w `supabase/migrations/` — przykład masz w
`supabase/migrations/0001_profiles.sql`. Numeruj je kolejno:
`0002_orders.sql`, `0003_add_column.sql` itd.

**2. Zastosuj migrację i wygeneruj typy**

```bash
npm run db:migrate
```

To jedna komenda która robi dwie rzeczy:
- pushuje migrację do twojego projektu Supabase
- generuje zaktualizowany plik `types/supabase.ts`

**3. Commituj oba pliki razem**

```bash
git add supabase/migrations/000X_nazwa.sql types/supabase.ts
git commit -m "feat: dodaj tabelę orders"
```

> `types/supabase.ts` jest commitowany do repozytorium — dzięki temu
> wszyscy w zespole mają aktualne typy bez uruchamiania czegokolwiek.

### Dlaczego `db:migrate` nie jest automatyczny w CI?

Migracja bazy produkcyjnej jest nieodwracalna — błędny SQL może zepsuć
schemat. Dlatego jest to świadomy, ręczny krok przed commitem,
a nie coś co dzieje się automatycznie po każdym pushu.

---

## Zaczynanie właściwego projektu

1. Nadpisz `app/page.tsx` własną landing page
2. Dopisz logikę po płatności w `app/api/webhooks/stripe/route.ts`
   (np. utwórz rekord w bazie, wyślij email powitalny)
3. Dostosuj szablon emaila w `lib/resend/emails/welcome.tsx`
4. Dodawaj nowe tabele przez `supabase/migrations/` + `npm run db:migrate`

---

## Komendy

| Komenda | Co robi |
|---|---|
| `npm run dev` | serwer deweloperski |
| `npm run build` | build produkcyjny |
| `npm run typecheck` | sprawdzenie typów TypeScript |
| `npm run lint` | ESLint |
| `npm run db:migrate` | push migracji do Supabase + generowanie typów |
| `npm run db:push` | tylko push migracji |
| `npm run db:types` | tylko generowanie typów |
| `npm run stripe:listen` | przekierowanie webhooków Stripe na localhost |
| `npm run vercel:env` | push zmiennych z `.env.local` do Vercel przez API |

---

## Skąd wziąć klucze

### Supabase (opcjonalne)

Dashboard → projekt → **Settings → API**

| Zmienna | Gdzie |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / public |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (trzymaj w tajemnicy) |

### Stripe

Dashboard → **Developers → API keys**

| Zmienna | Gdzie |
|---|---|
| `STRIPE_SECRET_KEY` | Secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable key |

Dashboard → **Developers → Webhooks** → dodaj endpoint
`https://twojadomena.com/api/webhooks/stripe` → skopiuj signing secret

| Zmienna | Gdzie |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Signing secret webhooka |
| `STRIPE_PRICE_ID` | (opcjonalne) ID ceny z Products |

### Resend

Dashboard → **API Keys → Create API Key**

| Zmienna | Gdzie |
|---|---|
| `RESEND_API_KEY` | wygenerowany klucz |
| `RESEND_FROM_EMAIL` | zweryfikowana domena np. `noreply@twojadomena.com` |

> Zweryfikuj domenę w Resend (Settings → Domains → Add Domain)
> żeby maile nie trafiały do spamu.

### Vercel

| Zmienna | Gdzie |
|---|---|
| `VERCEL_ACCESS_TOKEN` | Dashboard → Settings → Tokens → Create |
| `VERCEL_PROJECT_ID` | Dashboard → projekt → Settings → General → Project ID |
| `VERCEL_TEAM_ID` | (opcjonalne, dla kont zespołowych) Dashboard → Settings → General → Team ID |

---

## CI/CD

### GitHub Actions

Uruchamia się automatycznie na każdy PR i push do `master`:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build`

### Vercel

- Push do `main` → auto-deploy na **production**
- Otwarcie PR → auto-deploy na **preview URL**
- Zmienne środowiskowe ustawiane przez `npm run vercel:env` — nie przez Dashboard

---

## Struktura projektu

```
webapp-template/
├── app/
│   ├── page.tsx                     # strona setup — nadpisz własną landing page
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── webhooks/stripe/route.ts # obsługa zdarzeń Stripe
│       └── health/route.ts          # GET /api/health → { status, timestamp }
├── components/ui/                   # shadcn/ui (button, badge, card)
├── lib/
│   ├── supabase/                    # browser client, server client, middleware
│   ├── stripe/                      # SDK, createCheckoutSession, createPortalSession
│   └── resend/                      # SDK, WelcomeEmail, sendWelcomeEmail
├── scripts/
│   └── vercel-env-push.ts           # sync .env.local → Vercel API
├── types/
│   ├── supabase.ts                  # generowane przez db:migrate — commituj do repo
│   └── stripe.ts                    # typy dla webhook eventów
├── middleware.ts                    # odświeżanie sesji Supabase (no-op bez kluczy)
├── supabase/migrations/             # pliki SQL — dodawaj ręcznie, pushuj przez db:migrate
├── .env.example                     # szablon zmiennych — skopiuj do .env.local
└── .github/workflows/ci.yml        # lint + typecheck + build na PR/push
```
