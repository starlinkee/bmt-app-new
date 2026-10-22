---
status: done
---
# Krok 05: Plan Gmail/Google per konto (slice 7 — research i plan)

## Cel
Gotowy, uzasadniony plan, jak każde konto wysyła e-maile i korzysta z Google Sheets ze swoich poświadczeń, tak żeby
właściciel mógł podjąć decyzję. Packet: `/home/shiva/.openrig/workspace/projects/bmt-app/missions/multi-account/slices/10-s7-google-per-owner/SPEC.md`.

## Zakres
- Research: OAuth Google vs hasło aplikacji (SMTP) per konto — bezpieczeństwo, weryfikacja aplikacji przez Google,
  zakresy, odświeżanie tokenów, limity; dostęp do arkuszy-szablonów per konto.
- Szyfrowanie sekretów w bazie (np. pgsodium/Vault vs szyfrowanie w aplikacji z kluczem w env), rotacja.
- Flow podłączania konta w Ustawieniach, zachowanie gdy konto nie ma podłączonego Gmaila.
- Plan usunięcia `getLegacyOwnerId()` i `legacy_owner`; podział na slice'y z kryteriami akceptacji.
- Wynik: `docs/plans/google-per-konto.md` z rekomendacją i listą decyzji dla właściciela.

## Poza zakresem
- Jakikolwiek kod aplikacji i migracje — tylko dokument.
- Wyjście na produkcję (wymaga zgody właściciela, pg_dump produkcji i ręcznych testów).

## Kryteria akceptacji
- Dokument zawiera porównanie opcji ze źródłami, rekomendację, model danych sekretów, flow UI, plan slice'ów z kryteriami i listę otwartych decyzji.
- Repo bez zmian w kodzie aplikacji; `npm run typecheck` = 0.
