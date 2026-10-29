# Checklista: Google Cloud i Vercel dla łączenia kont Google (slice 7b)

Aplikacja jest gotowa, ale bez poniższej konfiguracji przycisk „Połącz z Google” kończy się komunikatem „nie jest jeszcze skonfigurowane”.
Nic z tego nie robią agenci — wymaga Twoich kont.

## 1. Google Cloud
1. console.cloud.google.com → wybierz (lub utwórz) projekt.
2. **Gmail API** → Włącz (APIs & Services → Library).
3. **Ekran zgody OAuth** (Google Auth platform → Branding/Audience):
   - typ użytkowników: **Zewnętrzny**;
   - status publikacji: **In production** (NIE „Testing” — w trybie Testing refresh token wygasa po 7 dniach);
   - aplikacja pozostaje **niezweryfikowana** (limit 100 nowych użytkowników, ostrzeżenie „Unverified app” przy zgodzie — to oczekiwane, D2 = a);
   - zakresy (Data Access): `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`. Nic więcej.
4. **Klient OAuth**: Clients → Create → typ **Web application**. Authorized redirect URIs (dokładnie, co do znaku):
   - preview: stały alias gałęzi `dev` + `/api/google/callback` (URL-e pojedynczych deployów się zmieniają, więc użyj aliasu);
   - produkcja: `https://<domena produkcyjna>/api/google/callback`;
   - (opcjonalnie lokalnie) `http://localhost:3000/api/google/callback`.
   Zapisz Client ID i Client secret.
   Możesz użyć istniejącego klienta (ten od Drive) — dodaj mu redirect URI i zakres; zmienne i tak są osobne (`GOOGLE_CONNECT_*`), więc `GOOGLE_OAUTH_*` używane przez Drive zostają nietknięte.

## 2. Vercel → Settings → Environment Variables (najpierw Preview, produkcja dopiero po decyzji)
| Zmienna | Wartość |
|---|---|
| `GOOGLE_CONNECT_CLIENT_ID` | Client ID z kroku 1.4 |
| `GOOGLE_CONNECT_CLIENT_SECRET` | Client secret (Sensitive) |
| `GOOGLE_CONNECT_REDIRECT_URI` | dokładnie ten URI, który wpisałeś w kliencie dla danego środowiska |
| `GOOGLE_CONNECT_ALLOWLIST` | adresy Google, którym wolno się połączyć, po przecinku (np. `a@gmail.com,b@gmail.com`). Pusta lub brak = nikt (fail closed) |
| `GOOGLE_TOKEN_KEY_V1` | 32 losowe bajty w base64, typ **Sensitive/Secret**, **inny** dla Preview i Production |

Klucz wygenerujesz: `openssl rand -base64 32`. Nie zmieniaj go ani nie usuwaj po połączeniu kont — utrata klucza = konta muszą połączyć się od nowa.
Rotacja: dodaj `GOOGLE_TOKEN_KEY_V2` obok V1, uruchom `node scripts/google-key-rotate.mjs --env-file=<plik>` (dry-run, potem `--apply`), dopiero potem usuń V1.
Po zmianie zmiennych zrób redeploy (zmienne wchodzą tylko do nowych deployów).

## 3. Sprawdzenie na żywo
1. Zaloguj się do aplikacji na preview → Ustawienia → sekcja „Google” → „Połącz z Google”.
2. Wybierz adres z listy, zatwierdź ostrzeżenie „Unverified app” (Zaawansowane → przejdź) i zaznacz zgodę na wysyłanie e-maili.
3. Powrót na Ustawienia: „Połączono jako <adres>”.
4. Adres spoza listy: komunikat „nie jest dozwolony”, nic nie zostaje zapisane.
5. Odłącz → „Niepołączono”; zgoda znika też z https://myaccount.google.com/permissions.
