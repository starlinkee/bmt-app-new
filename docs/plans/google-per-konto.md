# Plan: Gmail i Google (Drive, Sheets) per konto — slice 7

Status: plan do decyzji właściciela (research i dokument, bez kodu aplikacji i migracji).
Data researchu: 2026-10-23 (data dostępu do wszystkich źródeł). Stan kodu: `dev` @ `58cb9db`.

Konwencja źródeł: `[Sn]` odsyła do tabeli „Źródła” na końcu. Czego nie udało się potwierdzić w dokumentacji,
jest oznaczone **NIEZWERYFIKOWANE** i wylądowało w sekcji ryzyk/spike’a, a nie w tabeli faktów.

## 1. TL;DR

1. **Rekomendacja: OAuth Google per konto**, nie hasło aplikacji. Konto łączy Google jednym kliknięciem w Ustawieniach;
   aplikacja trzyma zaszyfrowany refresh token tego konta i z niego wysyła e-maile oraz robi kopie arkuszy.
2. **Wysyłka przez Gmail API (`gmail.send`, zakres „sensitive”), nie przez SMTP.** SMTP z OAuth wymaga zakresu
   `https://mail.google.com/` (pełny dostęp do poczty, „restricted”) [S12, S13]; `gmail.send` wystarcza do Gmail API [S11, S15].
3. **Drive/Sheets: `drive.file` (non-sensitive) + Google Picker** — konto wskazuje swój arkusz-szablon, aplikacja kopiuje go
   do Drive tego konta. To zastępuje konto serwisowe i wspólny `GOOGLE_OAUTH_REFRESH_TOKEN` z env [S3, S4, S9].
   Wymaga krótkiego spike’a (dwa punkty niezweryfikowane, sekcja 9).
4. **Sekrety:** tabela dostępna tylko dla service role, szyfrowanie AES‑256‑GCM w aplikacji z wersjonowanym kluczem w sekretach
   Vercela (alternatywa: Supabase Vault — też akceptowalna, patrz decyzja D3).
5. **Weryfikacja Google nie blokuje startu:** najwyższy potrzebny zakres to „sensitive” (nie „restricted”), więc **bez oceny CASA**;
   weryfikacja zakresów sensitive trwa zwykle 3–5 dni roboczych [S7]. Do tego czasu app „In production, unverified”
   obsłuży do 100 nowych użytkowników w całym życiu projektu, z ostrzeżeniem na ekranie zgody [S6]. Trybu „Testing” nie wolno używać
   (refresh token wygasa po 7 dniach) [S5, S6].

## 2. Dziś i dlaczego to blokuje wiele kont

Zweryfikowane w kodzie (`grep` + lektura plików, `58cb9db`):

| Obszar | Plik | Uwierzytelnienie dziś |
|---|---|---|
| Wysyłka e-maili | `lib/email.ts` (`getProviderConfig`, `sendEmail`, nodemailer → `smtp.gmail.com:587`) | login = `app_config.admin_email` konta **legacy** (`getLegacyOwnerId()`, `lib/email.ts:36`); hasło = env `GMAIL_APP_PASSWORD` (jedno dla wszystkich) |
| Drive (kopia szablonu, foldery, upload/kasowanie, share) | `lib/driveEngine.ts` (`getOAuthClient`) | OAuth2: jeden `GOOGLE_OAUTH_REFRESH_TOKEN` + `GOOGLE_OAUTH_CLIENT_ID/SECRET` w env (Drive właściciela); kopia jest udostępniana kontu serwisowemu (`copySpreadsheet` → `permissions.create`) |
| Sheets (named ranges, zapis wartości, przeliczenie) i eksport PDF | `lib/sheetsEngine.ts` (`getServiceAccountAuth`; zakresy `spreadsheets` + `drive.readonly`) | konto serwisowe z env `GOOGLE_SERVICE_ACCOUNT_JSON`; PDF to `fetch` na `docs.google.com/spreadsheets/d/…/export` z tokenem konta serwisowego |
| Inne użycia legacy | `app/api/skill-files/route.ts:4,17` (pliki AI tylko dla właściciela legacy, krok 03); `lib/app-config.ts:65` (definicja `getLegacyOwnerId`) | — |

Wysyłają z tego dziś: `sendMediaEmail`, `sendStatementEmail`, `sendStatementUploadReminderEmail`, `sendMeterReadingReminderEmail`,
`sendMediaSettlementAdminSummaryEmail` (wszystkie w `lib/email.ts`); wołają je `media/actions.ts`, `rozlicz-media/actions.ts`,
`kontrola-platnosci/actions.ts`, `lib/statement-reminder.ts`, `lib/meter-reading-reminder.ts`. `sendRentEmail` nie ma wywołań
(zgodne z regułą billingową: czynsze bez maili/PDF — `AGENTS.md`), więc jest kandydatem do usunięcia (decyzja D10).

**Dlaczego to blokuje wiele kont:** (a) każde konto wysyła z Gmaila właściciela, więc adres „Od:” i dzienny limit wysyłki są wspólne;
(b) kopie arkuszy powstają w Drive właściciela, a PDF-y not mediów obcych kont przechodzą przez jego konto Google;
(c) szablony arkuszy są per konto w bazie (slice 3), ale dostęp do nich ma tylko wspólne konto Google/serwisowe — nowe konto nie może wskazać swojego;
(d) trzy różne mechanizmy uwierzytelniania i trzy sekrety w env zamiast jednego modelu poświadczeń per konto.

Historia: kolumny `gmail_user`, `gmail_app_password(_2)` i `sender_account` były w `app_config` i zostały usunięte migracją
`20260919130000_drop_gmail_and_sender_account.sql` (hasła w bazie jawnym tekstem — wycofane na rzecz env). Nowy model sekretów
(sekcja 5) nie może wrócić do jawnych haseł w `app_config`.

## 3. Porównanie: OAuth vs hasło aplikacji

| Kryterium | OAuth Google per konto (rekomendowane) | Hasło aplikacji (SMTP) per konto |
|---|---|---|
| Bezpieczeństwo | Token ograniczony zakresami (`gmail.send` = tylko wysyłka), cofany przez użytkownika w koncie Google i przez nas przy odłączeniu [S14]. Brak hasła do skrzynki w bazie. | Hasło aplikacji daje pełny dostęp SMTP/IMAP do skrzynki; Google: „App passwords aren’t recommended and are unnecessary in most cases” [S1]. Użytkownik musi je wygenerować i wkleić. |
| Dostępność | Każde konto Google; konta Workspace pod warunkiem, że admin nie ustawił usług jako Restricted (`admin_policy_enforced`) [S5]. | Wymaga 2‑Step Verification; niedostępne, gdy 2SV jest tylko na kluczach bezpieczeństwa, na kontach służbowych/szkolnych oraz z Advanced Protection [S1]. Dla tego projektu to realne wykluczenie części kont. |
| Przyszłość | Ścieżka rekomendowana przez Google. | Google wygasił „less secure apps” (14.03.2025: SMTP/IMAP/POP przestały działać z hasłem konta), ale hasło aplikacji zostaje wymienione jako dozwolona opcja dla urządzeń/skanerów [S2]. Dokumentacja nie zapowiada wycofania haseł aplikacji [S1], ale je zniechęca. |
| Weryfikacja przez Google | Zakres `gmail.send` jest **sensitive** [S11], `drive.file` **non-sensitive** [S3], `spreadsheets` **sensitive** [S4]. Brak „restricted” ⇒ brak oceny bezpieczeństwa (CASA) [S3, S8]. Weryfikacja sensitive: strona domowa, polityka prywatności na tej samej domenie, weryfikacja domeny, film demo, uzasadnienie zakresów; zwykle 3–5 dni roboczych [S7]. | Nie dotyczy. |
| Zakresy | `gmail.send` + `drive.file` (+ ewentualnie `spreadsheets`, jeśli spike pokaże, że `drive.file` nie wystarcza do Sheets API). SMTP z OAuth wymagałby `https://mail.google.com/` (restricted) [S12, S13] — dlatego Gmail API. | Brak zakresów; pełny dostęp SMTP po haśle. |
| Odświeżanie / wygasanie | Refresh token wygasa m.in. gdy: użytkownik odwoła dostęp; 6 miesięcy bez użycia; **zmiana hasła, gdy token ma zakresy Gmail**; limit 100 tokenów na konto Google i klienta; polityka admina Workspace [S5]. W trybie Testing (typ External) token żyje 7 dni [S5, S6]. Aplikacja musi obsłużyć `invalid_grant` ⇒ status „wymaga ponownego połączenia”. | Hasło działa do ręcznego odwołania; przestaje działać po wyłączeniu 2SV lub odwołaniu hasła. Brak automatycznego wygasania. |
| Limity wysyłki | Gmail API: 100 jednostek na `messages.send`, 6000 jednostek/min na użytkownika ⇒ ok. 60 wysyłek/min; maks. 500 odbiorców na wiadomość [S16]. Limity dzienne konta (poniżej) obowiązują niezależnie od kanału. | Limity dzienne konta Google: Workspace 2000 wiad./dzień, 500 odbiorców zewn. na wiadomość; przez SMTP/POP/IMAP maks. 100 odbiorców na wiadomość [S17]. Konto prywatne: Google podaje próg „więcej niż 500 e‑maili dziennie / 500 odbiorców w jednym e‑mailu” [S18]. Limity są per konto, więc przy modelu per konto nie sumują się (w obecnym wspólnym Gmailu — tak). |
| Dostęp do szablonów arkuszy | Tak, przez `drive.file` + Picker (konto wybiera swój arkusz; sekcja 4) albo `drive`/`spreadsheets` (szerzej, restricted dla `drive` [S3]). | Nie rozwiązuje Drive/Sheets — i tak potrzebne OAuth albo konto serwisowe. Model mieszany (hasło + serwisowe) zostawia dwa mechanizmy. |
| Wysiłek wdrożenia | Średni: ekran zgody, trasy connect/callback, magazyn tokenów, Picker, przepisanie `email.ts`/`driveEngine`/`sheetsEngine`. | Mały dla samej poczty (pole w Ustawieniach + szyfrowanie), ale Drive/Sheets bez zmian ⇒ dług zostaje. |
| UX | „Połącz z Google” (ekran zgody). Do czasu weryfikacji: ostrzeżenie „Unverified app” [S6]. | Użytkownik musi włączyć 2SV, wygenerować 16-znakowe hasło i je przepisać; łatwo o błędy. |

Limity Drive/Sheets API (per projekt Google Cloud): Sheets 300 odczytów i 300 zapisów/min na projekt, 60/min na użytkownika [S19];
Drive 1 000 000 jednostek/min na projekt i 325 000/min na użytkownika, upload/kopie do 750 GB na dobę na użytkownika [S20]. Przy skali
tej aplikacji (kilkadziesiąt nót miesięcznie na konto) to nie jest ograniczenie; limity per użytkownik oznaczają, że konta nie dławią się nawzajem.

## 4. Rekomendacja i warunki

**Wybór: OAuth per konto (Gmail API `gmail.send` + Drive `drive.file` z Pickerem), jeden klient OAuth (aplikacja webowa) dla całej instancji.**

Uzasadnienie: usuwa współdzielone sekrety z env (`GMAIL_APP_PASSWORD`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`),
daje każdemu kontowi własnego nadawcę i własny limit dzienny, nie wymaga zakresów „restricted” ani CASA, a konta bez 2SV/kluczy/Workspace-blokady
też działają.

**Dostęp do szablonów — trzy warianty (dla pkt 3 zadania):**

| Wariant | Zakres | Ocena |
|---|---|---|
| A. `drive.file` + Google Picker (rekomendowane) | non-sensitive [S3]. `drive.file` obejmuje pliki, które użytkownik otworzył aplikacją lub udostępnił jej przez Picker [S3, S9]. Dla Sheets Google zaleca właśnie `drive.file` [S4]. | Najmniejsze uprawnienia, najprostsza weryfikacja. Wymaga: Picker w Ustawieniach (wybór szablonu i folderu); dodatkowe wymagania konfiguracyjne Pickera (np. klucz API) nie zostały potwierdzone na pobranej stronie [S9] — do sprawdzenia w spike’u. **Spike (sekcja 9):** czy kopia pliku wskazanego w Pickerze i eksport PDF tokenem `drive.file` działają. |
| B. pełny `drive` | restricted [S3], dla Sheets również restricted [S4] | Wymaga weryfikacji restricted i oceny CASA przy przechowywaniu danych na serwerze [S8]; Google dopuszcza restricted w Drive tylko dla wybranych kategorii aplikacji [S3]. Odradzane. |
| C. dalej konto serwisowe, któremu każde konto udostępnia szablon | brak zgody OAuth | Zostaje wspólny sekret i krok ręcznego udostępnienia przez użytkownika. Konto serwisowe nie ma limitu pamięci ani własnych plików („Service accounts don’t have storage quota and can’t own files”) — pliki muszą trafiać do dysków współdzielonych albo do Drive użytkownika przez OAuth [S10]. Czyli kopie i PDF-y i tak wymagają OAuth użytkownika; wariant C nie eliminuje OAuth, tylko go dubluje. |

**Warunki i plan B:**
- *VB nie chce przechodzić weryfikacji Google:* zostaje „In production, unverified” — działa do 100 nowych użytkowników w całym życiu projektu,
  użytkownicy widzą ostrzeżenie „Unverified app” [S6]; refresh tokeny nie wygasają po 7 dniach (to dotyczy tylko statusu Testing) [S5, S6].
  Jeśli kont będzie więcej niż 100 lub ostrzeżenie jest nie do przyjęcia — weryfikacja sensitive (3–5 dni roboczych, wymaga domeny, strony domowej i polityki prywatności) [S7].
- *Wszystkie konta w jednej organizacji Workspace:* typ „Internal” — brak weryfikacji także dla zakresów sensitive/restricted [S21, S6]. Nie dotyczy, jeśli konta są prywatnymi Gmailami.
- *Awaryjnie (tylko poczta):* hasło aplikacji per konto jako przejściowy etap 1 (szyfrowanie jak w sekcji 5), z jawnym ograniczeniem, że nie działa na kontach z 2SV tylko na kluczach, służbowych i Advanced Protection [S1].
  Rekomenduję pominąć ten etap: koszt zbliżony do Gmail API, a dług zostaje.
- Nie używać statusu Testing w żadnym środowisku poza lokalnym developmentem [S5, S6].

## 5. Model danych sekretów

**Zasada:** sekret nigdy nie jest czytelny dla klienta sesji. Klucz z RLS „owner access” nie wystarcza (kolumna z tokenem byłaby czytelna przez
PostgREST dla właściciela), dlatego dwie tabele.

| Tabela | Kolumny | Dostęp |
|---|---|---|
| `google_connections` (status, jawne) | `owner_id uuid pk → auth.users`, `google_email text`, `scopes text[]`, `status text` (`connected` / `needs_reauth` / `disconnected`), `connected_at timestamptz`, `last_ok_at timestamptz`, `last_error text` (kod, bez danych osobowych), `template_file_id text`, `folder_id text` | RLS „owner access” tylko `SELECT` dla `authenticated` (UI pokazuje status); zapis wyłącznie service role |
| `google_credentials` (sekret) | `owner_id uuid pk → auth.users`, `refresh_token_ct bytea` (szyfrogram), `iv bytea`, `key_version smallint`, `created_at`, `rotated_at` | `ENABLE RLS`, **brak polityk**, `REVOKE ALL … FROM anon, authenticated`; tylko service role (wzór: `legacy_owner`, `system_settings`) |

Zgodnie z zasadą projektu każda zmiana schematu idzie przez migrację z rollbackiem (`AGENTS.md`); tabele dochodzą do listy strażnika
z kroku 04 (nowa tabela z `owner_id` bez wpisu w `isolation.test.ts` robi test czerwonym — to zamierzone).

**Szyfrowanie (rekomendacja): AES‑256‑GCM w aplikacji (Node `crypto`).**
- Świeży losowy IV 12 B na każde szyfrowanie, tag uwierzytelniający 128 bit sprawdzany przy odszyfrowaniu (`decipher.final()` rzuca przy zmanipulowanym szyfrogramie) [S22].
- AAD = `owner_id` ⇒ szyfrogram skopiowany do wiersza innego konta nie odszyfruje się.
- Klucz: sekret Vercela (`GOOGLE_TOKEN_KEY_V<n>`, typ Secret/write‑only), osobny per środowisko (Production/Preview) [S23]; wartość 32 losowe bajty (base64). Limit 64 KB na zestaw zmiennych nie jest problemem [S23].
- **Rotacja klucza:** `key_version` w wierszu; w env równolegle klucz bieżący i poprzedni; skrypt przeszyfrowujący wiersze `key_version < current` (idempotentny, dry-run domyślnie); po przeszyfrowaniu usunięcie starego klucza. Utrata klucza = konta muszą połączyć Google od nowa (status `needs_reauth`), bez utraty danych biznesowych.
- Kto może odszyfrować: wyłącznie kod serwera z service role + kluczem z env. Klient sesji nie ma dostępu do tabeli [S24: service role omija RLS, klucz nie może trafić do przeglądarki]. Dump bazy bez klucza z env jest bezużyteczny.

**Alternatywa: Supabase Vault.** Sekrety w `vault.secrets` szyfrowane (authenticated encryption), klucz poza bazą i zarządzany przez Supabase, w backupach i replikacji zaszyfrowane; dostęp do widoku `vault.decrypted_secrets` daje plaintext, więc trzeba zawęzić role [S25].
Wady dla tego projektu: `pg_dump`/`pg_restore` do nowego projektu **nie przenosi klucza** (trzeba skopiować klucz źródłowego projektu) [S25] — a ten projekt ma osobne bazy preview/produkcja i ręczne operacje na dumpach; `pgsodium` jest „pending deprecation”, Vault ma pozostać z niezmienionym API [S26]. Obie opcje są poprawne; rekomenduję AES w aplikacji ze względu na przenośność i jawny model rotacji (decyzja D3).

**Odłączenie konta:** (1) `POST https://oauth2.googleapis.com/revoke` z refresh tokenem (best effort; błąd nie blokuje) [S14]; (2) usunięcie wiersza z `google_credentials`; (3) `google_connections.status = 'disconnected'`, czyszczenie `last_error`; (4) dane biznesowe, `email_logs` i pliki w Storage zostają; (5) akcje wymagające Google zaczynają się zachowywać jak „brak połączenia” (sekcja 6). Odłączenie przy usuwaniu konta: kolejność usunięcia wierszy właściciela opisana w `tests-support/isolationUsers.ts` (`owner_id` nie ma `ON DELETE CASCADE`) — dołożyć obie nowe tabele.

**Migracja istniejących poświadczeń właściciela:** obecny `GOOGLE_OAUTH_REFRESH_TOKEN` z env można jednorazowo zaszyfrować i wstawić do `google_credentials` konta legacy (skrypt jak `scripts/storage-copy-to-owner.mjs`: dry-run, preview, bez wypisywania sekretów), ale zakresy tego tokenu pochodzą z pierwotnego klienta (prawdopodobnie `drive`) — **NIEZWERYFIKOWANE**; bezpieczniej, by właściciel połączył Google przez nowy flow (zakresy `gmail.send` + `drive.file`). Decyzja D5.

## 6. Flow w Ustawieniach i zachowanie bez Gmaila

**Flow (strona `/ustawienia`, sekcja „Google”):**
1. *Status:* „Niepołączono” / „Połączono jako <adres Google>” / „Wymaga ponownego połączenia (<powód>)”, data ostatniego udanego użycia.
2. *Połącz:* przycisk ⇒ trasa serwerowa generuje `state` (losowy, zapisany w ciasteczku `HttpOnly`, weryfikowany w callbacku — ochrona przed CSRF) [S14] i przekierowuje na ekran zgody z `access_type=offline` i `prompt=consent` (refresh token jest zwracany tylko przy pierwszej autoryzacji, ponowne uzyskanie wymaga `prompt=consent`) oraz `include_granted_scopes=true` [S14]. Zakresy żądane przyrostowo: najpierw `gmail.send`, wybór szablonu/folderu (Picker) dopiero przy konfiguracji arkuszy [S27]. Callback wymienia kod na tokeny, sprawdza przyznane zakresy (użytkownik może odznaczyć część) i ustawia status [S27].
3. *Wybierz szablon i folder:* Picker (wymaga zalogowanego użytkownika i tokenu dostępu [S9]); identyfikatory trafiają do `google_connections.template_file_id` / `folder_id` (obecne `rent_invoice_spreadsheet_id`/`drive_invoices_folder_id` w `app_config` są sprzątane w slice 7d).
4. *Odłącz:* jak w sekcji 5.
5. *Błąd tokenu:* przy `invalid_grant` (odwołanie dostępu, zmiana hasła przy zakresach Gmail, 6 miesięcy bez użycia, polityka admina [S5]) status → `needs_reauth` z komunikatem „Połącz Google ponownie”; baner na górze aplikacji dla tego konta.

**Zachowanie bez podłączonego Gmaila (rekomendacja):**

| Akcja | Zachowanie | Komunikat / ślad |
|---|---|---|
| Ręczna wysyłka wyciągu (jeden / zbiorcza) — `kontrola-platnosci` | Blokada przed jakąkolwiek zmianą | „Aby wysłać e-mail, połącz Gmaila w Ustawieniach.” Zbiorcza: 0 wysłanych + ten komunikat |
| Rozliczenie mediów + noty (`media`, `rozlicz-media`) | Blokada **przed** utworzeniem kopii arkusza i zapisów w bazie (żeby nie zostawiać stanu pośredniego); dotyczy też braku Google dla Sheets/Drive | Ten sam komunikat; wynik `{ success: false, code: 'google_not_connected' }` |
| Crony per konto (przypomnienia o wyciągu i odczytach) | **Pomijane**, bez błędu krytycznego | wynik konta: `{ ownerId, ok: true, skipped: 'google_not_connected' }`; `allOwnersFailed` liczy tylko `ok:false`, więc cron nie kończy się 500 przez konta bez połączenia; **nie** zapisujemy wpisu w `reminder_dedup`, żeby przypomnienie poszło po podłączeniu |
| Generowanie czynszów (`generateRents`) | Bez zmian — czynsze nie wysyłają maili ani PDF (`AGENTS.md`, reguła 1) | — |
| Błąd tokenu w trakcie (np. `invalid_grant`) | Jak „niepodłączone”, dodatkowo status → `needs_reauth` | wynik crona: `{ ok: false, error: 'google_reauth_required' }` dla tego konta, inne konta idą dalej (`runForEachOwner`, krok 01) |

Widoczność w wyniku crona: istniejący kształt `results[]` per konto zostaje (`ok`, `error`, pola zadania); dochodzi tylko `skipped`. Test integracyjny z kroku 01 (`crons.test.ts`) rozszerzyć o konto bez połączenia.

Nadawca: „Od:” = adres Google połączonego konta (`google_connections.google_email`). Dziś `app_config.admin_email` pełni dwie role: adres nadawcy
(`lib/email.ts:36-40`, `lib/rents.ts:53` jako `senderEmail`) oraz adres odbiorcy podsumowań i przypomnień dla administratora
(`rozlicz-media/actions.ts:563-567`, `lib/statement-reminder.ts:20`). Role trzeba rozdzielić: nadawca z połączenia Google, `admin_email` tylko jako odbiorca (D8).

## 7. Plan usunięcia `getLegacyOwnerId()` i `legacy_owner`

Pełna lista miejsc użycia (`grep` w repo, `58cb9db`, bez `node_modules`):

| Miejsce | Użycie | Co zrobić |
|---|---|---|
| `lib/app-config.ts:61-70` | definicja `getLegacyOwnerId()` | usunąć w slice 7e |
| `lib/email.ts:3,35-36` | nadawca z konta legacy | slice 7c: nadawca = konto |
| `app/api/skill-files/route.ts:4,17` | pliki AI tylko dla właściciela legacy (`ai-files/` pisze runner VPS bez prefiksu) | slice 7e: zastąpić regułą niezależną od tabeli (D7): np. runner pisze pod `<owner_id>/ai-files/` (zmiana poza repo) albo jawna zmienna `AI_FILES_OWNER_ID` |
| `scripts/storage-copy-to-owner.mjs` (84-85) | jednorazowe kopiowanie storage | skrypt wykonany na preview w kroku 03; usunąć albo przyjmować `--owner` |
| `tests-support/appConfig.ts:21`, `__tests__/integration/setup.ts:9,26-31`, `__tests__/integration/owner-default.test.ts:24`, `e2e/izolacja.spec.ts:11` | konto „sesji” testów = właściciel z `legacy_owner` | zastąpić jawnym kontem testowym (np. konto z `E2E_LOGIN_EMAIL` / dedykowany użytkownik zakładany w `global-setup`) |
| `__tests__/integration/isolation.test.ts` (`SERVICE_ONLY`, blok `legacy_owner`, wiersze raportu) i `docs/roadmap/isolation-matrix.md` | macierz zna tabelę | usunąć wpisy; test „wpisy macierzy odpowiadają istniejącym tabelom” padnie, jeśli się zapomni |
| testy jednostkowe: `__tests__/unit/appConfig.test.ts:20,70-75`, `rents.test.ts:28`, `ownerWrites.test.ts:26,38`, `reminders.test.ts:35`, `storageOwnership.test.ts:18`, `server-actions-auth.test.ts:273-283` | mocki i literał `'legacy_owner'` w strażniku `.from(...)` | usunąć mocki; z listy literałów strażnika usunąć `legacy_owner` |
| `types/supabase.ts:113` | typ tabeli | regeneracja po migracji |
| SQL: `supabase/migrations/20261012140000_owner_id_rls.sql`, `20261012200000_app_config_per_owner.sql`, `20261021090000_reminder_dedup_per_owner.sql`, `20261021100000_drop_legacy_owner_default.sql` (komentarze), rollbacki, `scripts/verify-owner-backfill.sql` | historia i backfill | migracje historyczne nie są edytowane; `verify-owner-backfill.sql` oznaczyć jako archiwalny |
| `multi-account-plan.md:49,58`, `docs/roadmap/PROGRESS.md` | dokumentacja | zaktualizować po slice 7e |

**Kolejność:** (1) slice 7c — `email.ts` bez `getLegacyOwnerId`; (2) przeniesienie `skill-files` (D7); (3) testy i skrypty bez `legacy_owner`; (4) dopiero wtedy migracja
`DROP TABLE public.legacy_owner` (i usunięcie typu). `current_owner_id()` nie używa już tabeli od kroku 02 (`SELECT auth.uid()`), więc usunięcie jest bezpieczne dla DEFAULT-ów.
**Migracja danych właściciela:** brak — `owner_id` jest już na wszystkich wierszach; jedyną informacją w `legacy_owner` jest uuid właściciela, który migracja zapisuje w komentarzu rollbacku/raporcie (nie jako sekret).
**Rollback:** `…down.sql` odtwarza tabelę (`id=1`, `REVOKE ALL` dla `anon, authenticated`) i wstawia uuid właściciela; ponieważ uuid nie jest znany w pliku statycznym, rollback przyjmuje go z parametru (`:owner`) albo z `google_connections`/`app_config` konta oznaczonego jako właściciel — do ustalenia w slice 7e wraz z backupem `pg_dump` tabeli przed dropem.
Weryfikacja końcowa: `grep -rn "legacy_owner\|getLegacyOwnerId" --include=*.ts --include=*.tsx --include=*.mjs .` zwraca tylko migracje historyczne i ten dokument.

## 8. Podział na slice’y (wg wzoru packetów misji; dokument nie tworzy plików slice’ów)

Każdy slice kończy się commitem po polsku, zielonym `typecheck`, `lint`, `test`, `test:integration` na preview i e2e; slice’y z migracją dodatkowo `Migracje OK.` w buildzie preview. Produkcja — poza zakresem agentów (zgoda właściciela, `pg_dump`, testy ręczne).

**7a. Magazyn poświadczeń (bez UI).**
Cel: bezpieczne tabele i moduł szyfrowania.
Zakres: migracja + rollback `google_connections`, `google_credentials` (RLS jak w sekcji 5); `lib/secret-box.ts` (AES‑256‑GCM, `key_version`, AAD = `owner_id`); skrypt rotacji (dry-run).
Kryteria: test jednostkowy round-trip, odrzucenie zmanipulowanego szyfrogramu i szyfrogramu z innym `owner_id`; macierz izolacji (krok 04) obejmuje nowe tabele — konto A nie widzi ani nie zapisuje `google_credentials` B, `authenticated` nie ma żadnego dostępu do `google_credentials`, `SELECT` na `google_connections` tylko własny wiersz; asercja w migracji.

**7b. Podłączenie konta (OAuth) i ekran w Ustawieniach.**
Cel: konto łączy, widzi status i odłącza Google.
Zakres: trasy `connect`/`callback` (`state` w ciasteczku, `access_type=offline`, `prompt=consent`), wymiana kodu, zapis zaszyfrowanego tokenu, `revoke` przy odłączeniu, sekcja w `/ustawienia`, baner `needs_reauth`. Wymaga skonfigurowanego ekranu zgody i klienta OAuth w Google Cloud (D2).
Kryteria: test integracyjny z zamockowanym Google (kod → tokeny → wiersze); e2e: stan „Niepołączono” → po symulowanym callbacku „Połączono”; po `invalid_grant` status `needs_reauth`; odłączenie kasuje wiersz sekretu; token nie pojawia się w odpowiedziach HTTP ani logach (test grep po odpowiedziach).

**7c. Wysyłka e-mail per konto (Gmail API).**
Cel: nadawca = konto; koniec `GMAIL_APP_PASSWORD` i `getLegacyOwnerId()` w `lib/email.ts`.
Zakres: przepisanie `sendEmail` na `gmail.users.messages.send` (MIME budowany lokalnie, załączniki PDF), refresh tokenu z `google_credentials`, obsługa `invalid_grant`; zachowania z tabeli sekcji 6 (blokady, `skipped`); rozdzielenie `admin_email` (D8).
Kryteria: testy integracyjne (Gmail zamockowany): wysyłka konta A używa tokenu A, nie B; brak połączenia ⇒ komunikat i brak zapisu w `email_logs`; cron: konto bez połączenia ⇒ `skipped`, pozostałe wysyłają, `reminder_dedup` bez wpisu; `grep GMAIL_APP_PASSWORD` w kodzie aplikacji = 0.

**7d. Drive i Sheets per konto.**
Cel: kopie arkuszy, zapis wartości i eksport PDF tokenem konta; koniec konta serwisowego i wspólnego refresh tokenu.
Zakres: najpierw **spike** (sekcja 9), potem `driveEngine`/`sheetsEngine` przyjmujące klienta konta, Picker w Ustawieniach, przeniesienie `template_file_id`/`folder_id`, usunięcie `getServiceAccountEmail()` i udostępniania kopii kontu serwisowemu.
Kryteria: test integracyjny z zamockowanym Google: noty konta A powstają w jego Drive i tokenem A; brak połączenia ⇒ blokada przed utworzeniem czegokolwiek (bez wierszy `media_settlements`); wynik spike’a opisany w PROGRESS; usunięte `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_OAUTH_REFRESH_TOKEN` z `.env.example` i kodu.

**7e. Usunięcie `getLegacyOwnerId()` i `legacy_owner`.**
Cel i zakres: sekcja 7 (kolejność, migracja `DROP`, rollback, testy bez `legacy_owner`, decyzja o `skill-files`).
Kryteria: `grep` jak w sekcji 7; macierz izolacji bez tabeli i zielona; test-strażnik zielony; rollback sprawdzony na preview (drop → rollback → drop).

**7f. Wdrożenie.**
Cel: właściciel i kolejne konta na nowym modelu na produkcji.
Zakres: weryfikacja Google (jeśli D2), migracja poświadczeń właściciela (D5), `pg_dump` produkcji, ręczne testy not mediów i przypomnień, wyłączenie starych zmiennych w Vercel.
Kryteria: lista kontrolna zatwierdzona przez właściciela; poza zakresem automatycznych agentów.

## 9. Ryzyka i punkty NIEZWERYFIKOWANE (wymagają spike’a w 7d)

1. **Kopia pliku wybranego w Pickerze tokenem `drive.file`.** Dokumentacja mówi, że `drive.file` obejmuje pliki, które użytkownik wskazał przez Picker [S3, S9]; strona Pickera nie opisuje szablonów ani kopiowania [S9] — **NIEZWERYFIKOWANE**, czy `files.copy` szablonu zadziała i czy kopia będzie dostępna dla Sheets API.
2. **Eksport PDF.** Obecny kod robi `fetch` na `docs.google.com/spreadsheets/d/…/export?format=pdf` z tokenem. Czy token `drive.file` jest akceptowany przez ten URL — **NIEZWERYFIKOWANE** (alternatywa: `drive.files.export`).
3. **Maks. rozmiar załączników w Gmail API** — nie ustalono z oficjalnej dokumentacji (strona metody nie podaje formatu ani limitu [S11]); noty PDF są małe, ale sprawdzić na preview.
4. **Zakresy obecnego klienta OAuth właściciela i jego status ekranu zgody** (Testing vs In production) nie są znane z repo. Gdyby był w Testing, obecny token wygasałby co 7 dni [S5] — skoro działa, najpewniej jest w produkcji lub Internal; potwierdzić z VB (D2).
5. **Zmiana hasła do konta Google** unieważnia tokeny z zakresami Gmail [S5] — UX musi jasno mówić „połącz ponownie”, a nie „błąd”.
6. **Wspólny projekt Google Cloud = wspólne limity projektu** (Gmail 1 200 000 jednostek/min [S16], Sheets 300/min [S19]); limity per użytkownik chronią konta przed sobą, ale warto logować 429.
7. **Konta Workspace z blokadą admina** (`admin_policy_enforced`) nie połączą się [S5] — komunikat w UI, ścieżka awaryjna: hasło aplikacji tylko dla poczty, jeśli nie jest zablokowane [S1].

## 10. Otwarte decyzje dla VB

| # | Decyzja | Opcje | Rekomendacja |
|---|---|---|---|
| D1 | Mechanizm poświadczeń | (a) OAuth per konto, (b) hasło aplikacji + konto serwisowe, (c) mieszane etapami | **(a)** — sekcje 3–4 |
| D2 | Tryb aplikacji Google | (a) „In production”, niezweryfikowana (≤100 nowych użytkowników w życiu projektu, ostrzeżenie „Unverified app”); (b) weryfikacja sensitive (domena, strona domowa, polityka prywatności, film demo; 3–5 dni roboczych); (c) „Internal” (tylko gdy wszystkie konta są w jednej organizacji Workspace); Testing wykluczony | **(a) na start, (b) gdy kont będzie > ok. 20 lub ostrzeżenie przeszkadza.** Wymaga odpowiedzi: ile kont w perspektywie roku, czy jest publiczna domena i polityka prywatności, jaki jest obecny status ekranu zgody |
| D3 | Magazyn sekretów | (a) AES‑256‑GCM w aplikacji + klucz w Vercel, (b) Supabase Vault | **(a)** (przenośność dump/restore, jawna rotacja); (b) akceptowalne, jeśli zależy Ci na braku klucza w env |
| D4 | Szablony arkuszy | (a) `drive.file` + Picker, (b) `drive` (restricted, CASA), (c) konto serwisowe | **(a)**, warunkowo od wyniku spike’a (sekcja 9, pkt 1–2); (c) jako wycofanie |
| D5 | Istniejące poświadczenia właściciela | (a) właściciel łączy Google od nowa nowym flow, (b) jednorazowa migracja obecnego refresh tokenu z env | **(a)** (poprawne zakresy, brak sekretu z env w bazie) |
| D6 | Brak połączenia przy crone | (a) pomiń z `skipped` (bez dedupu), (b) traktuj jako błąd | **(a)**; ręczne akcje — blokada z komunikatem |
| D7 | Pliki AI (`ai-files/`, runner VPS) po usunięciu `legacy_owner` | (a) runner pisze pod `<owner_id>/ai-files/`, (b) stała zmienna `AI_FILES_OWNER_ID`, (c) wyłączyć widok dla pozostałych kont | **(a)** długoterminowo, **(b)** do czasu zmiany runnera |
| D8 | Rozdzielenie `admin_email` | (a) „Od:” = adres Google, `admin_email` = odbiorca podsumowań, (b) zostawić jedno pole | **(a)** |
| D9 | Kto prowadzi konfigurację Google Cloud (klient OAuth, ekran zgody, klucz API Pickera, ewent. weryfikacja domeny) | VB osobiście / agent z instrukcją | VB (wymaga logowania do konsoli Google); agent przygotuje checklistę w slice 7b |
| D10 | Martwy `sendRentEmail` | usunąć w slice 7c / zostawić | usunąć (reguła billingowa: czynsze bez maili) |

## Źródła (dostęp 2026-10-23)

| # | Źródło | Użyte do |
|---|---|---|
| S1 | Google Account Help, „Sign in with app passwords” — https://support.google.com/accounts/answer/185833 | wymagania i wyjątki haseł aplikacji; „not recommended” |
| S2 | Google Workspace Admin, „Transition from less secure apps to OAuth” — https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth | 14.03.2025, SMTP z hasłem konta; hasło aplikacji jako opcja |
| S3 | Google Drive API, „Choose Google Drive API scopes” (aktualizacja 2026-09-03) — https://developers.google.com/workspace/drive/api/guides/api-specific-auth | klasyfikacja zakresów Drive, kwalifikacje dla restricted |
| S4 | Google Sheets API, „Choose Google Sheets API scopes” — https://developers.google.com/workspace/sheets/api/scopes | `spreadsheets` sensitive, `drive.file` zalecany |
| S5 | Google Identity, „Using OAuth 2.0 to Access Google APIs” (sekcja o wygasaniu refresh tokenów) — https://developers.google.com/identity/protocols/oauth2#expiration | powody wygasania tokenów, 7 dni w Testing, limit 100 tokenów |
| S6 | Google Cloud Help, „Manage App Audience” — https://support.google.com/cloud/answer/15549945 | Internal/External, Testing (100 użytkowników, 7 dni), limit 100 użytkowników niezweryfikowanej aplikacji |
| S7 | Google Identity, „Sensitive scope verification” — https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification | wymagania i czas weryfikacji sensitive |
| S8 | Google Identity, „Restricted scope verification” — https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification | ocena bezpieczeństwa CASA, coroczna |
| S9 | Google Picker, „Overview” — https://developers.google.com/workspace/drive/picker/guides/overview | Picker i `drive.file`; wymaga zalogowanego użytkownika |
| S10 | Google Drive API, „About shared drives” — https://developers.google.com/workspace/drive/api/guides/about-shareddrives | konta serwisowe bez limitu pamięci i własności plików |
| S11 | Gmail API, `users.messages.send` — https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send | zakresy akceptowane przez `messages.send` |
| S12 | Nodemailer, „SMTP — OAuth2” — https://nodemailer.com/smtp/oauth2 | SMTP wymaga zakresu `https://mail.google.com/` |
| S13 | Google, „OAuth 2.0 mechanism for IMAP/SMTP (XOAUTH2)” — https://developers.google.com/gmail/imap/xoauth2-protocol | zakres dla IMAP/POP/SMTP; wynik wyszukiwania, strona nie została pobrana w całości |
| S14 | Google Identity, „OAuth 2.0 for Web Server Applications” — https://developers.google.com/identity/protocols/oauth2/web-server | `access_type=offline`, `prompt=consent`, `state`, `revoke`, `include_granted_scopes` |
| S15 | Google, „Gmail API scopes” — https://developers.google.com/gmail/api/auth/scopes | `gmail.send` sensitive; `gmail.compose`/`readonly` restricted |
| S16 | Gmail API, „Usage limits” — https://developers.google.com/workspace/gmail/api/reference/quota | 100 jednostek/`send`, 6000/min/użytkownik, 500 odbiorców |
| S17 | Google Workspace, „Gmail sending limits in Google Workspace” — https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace | limity dzienne Workspace, 100 odbiorców przez SMTP |
| S18 | Gmail Help, „Gmail sending limits” — https://support.google.com/mail/answer/22839 | próg 500 e-maili/odbiorców (konto prywatne, ogólnie) |
| S19 | Sheets API, „Usage limits” — https://developers.google.com/workspace/sheets/api/limits | 300/min na projekt, 60/min na użytkownika |
| S20 | Drive API, „Usage limits” — https://developers.google.com/workspace/drive/api/guides/limits | kwoty, 750 GB/dobę upload/kopie |
| S21 | Google Workspace, „Configure OAuth consent screen” — https://developers.google.com/workspace/guides/configure-oauth-consent | aplikacje Internal bez weryfikacji |
| S22 | Node.js, dokumentacja `crypto` (GCM, `getAuthTag`/`setAuthTag`, `final()` rzuca przy niezgodnym tagu) — https://nodejs.org/api/crypto.html | AES‑GCM (zalecany IV 12 B wynika z ogólnej praktyki GCM — w pobranym fragmencie dokumentacji brak jawnego zalecenia) |
| S23 | Vercel, „Environment variables” (aktualizacja 2026-09-17) — https://vercel.com/docs/environment-variables | typ Secret write‑only, zakresy środowisk, limit 64 KB |
| S24 | Supabase, „Row Level Security” — https://supabase.com/docs/guides/database/postgres/row-level-security | service role omija RLS; klucza nie wolno wystawiać do przeglądarki; RLS bez polityk = brak dostępu |
| S25 | Supabase, „Vault” — https://supabase.com/docs/guides/database/vault | szyfrowanie, klucz poza bazą, dostęp do widoku, ostrzeżenie o `pg_dump` |
| S26 | Supabase, „pgsodium (pending deprecation)” — https://supabase.com/docs/guides/database/extensions/pgsodium | pgsodium wygaszany, Vault bez zmiany API |
| S27 | Google Identity, „Using OAuth 2.0 to Access Google APIs” (kroki 2–3) — https://developers.google.com/identity/protocols/oauth2 | przyrostowe żądanie zakresów, sprawdzanie przyznanych zakresów |

Nieznalezione/niejednoznaczne w źródłach: (1) czy token `drive.file` obsługuje URL eksportu `docs.google.com/.../export`; (2) zachowanie `files.copy` na pliku z Pickera;
(3) limit rozmiaru załączników Gmail API; (4) dokładne limity dzienne konta prywatnego dla SMTP (strona Google podaje tylko ogólny próg 500, bez rozróżnienia kanałów);
(5) numer wersji `pgsodium` i data wycofania (dokumentacja podaje tylko „pending deprecation”). Szczegóły ryzyk — sekcja 9.
