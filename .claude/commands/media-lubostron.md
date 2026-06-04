Używając Playwright w trybie HEADLESS (przeglądarka niewidoczna, bez GUI, bez okna —
oszczędność zasobów):

## Środowisko

Playwright jest dostępny jako moduł **Node.js** (NIE Python).
Wymagaj go przez: `require('/home/apprunner/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')`
Uruchamiaj skrypty przez: `node nazwa_skryptu.js`
Zmienne środowiskowe ładuj przez: `source skill-runner/secrets.env && node nazwa_skryptu.js`

Dane logowania pobieraj ze zmiennych środowiskowych (NIE hardcoduj w skrypcie):
- login: `process.env.MMSOFT_LOGIN`
- hasło: `process.env.MMSOFT_PASSWORD`

## WAŻNE: Logowanie na mmsoft.com.pl

### Metoda podstawowa — zapisana sesja (używaj tej)

Plik `/opt/bmt-app/session-mmsoft.json` zawiera zapisane cookies z ręcznego logowania.
Używaj go tworząc kontekst przeglądarki:

```javascript
const context = await browser.newContext({
  storageState: '/opt/bmt-app/session-mmsoft.json'
});
```

Dzięki temu nie musisz logować się przy każdym uruchomieniu.

### Metoda awaryjna — gdy sesja wygasła

Jeśli po wejściu na stronę URL wskazuje na stronę logowania, sesja wygasła.
Formularz używa JavaScript do hashowania hasła MD5 przez funkcję `zamieniaj()`.
Standardowe `fill()` + `click()` NIE DZIAŁA.

**Jedyna działająca metoda logowania:**

```javascript
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle' }),
  page.evaluate(([l, p]) => {
    const f = document.forms['FmLog'];
    f.Adm.value = l;
    f.Pas.value = p;
    zamieniaj(); // hashuje hasło MD5 i ustawia ukryte pola
    f.submit();
  }, [login, password])
]);
```

`Promise.all` jest konieczny — `f.submit()` wywołuje nawigację która niszczy kontekst
wykonania zanim `evaluate()` zwróci wynik. Bez `Promise.all` skrypt rzuci błąd
"Execution context was destroyed".

Po zalogowaniu zapisz nową sesję:
```javascript
await context.storageState({ path: '/opt/bmt-app/session-mmsoft.json' });
```

## Kroki

1. Utwórz kontekst z `storageState: '/opt/bmt-app/session-mmsoft.json'` (jeśli plik istnieje).
2. Przejdź na https://mmsoft.com.pl/lokale.php?Adm=1
3. Sprawdź czy jesteś zalogowany (URL nie powinien wskazywać na stronę logowania).
   Jeśli sesja wygasła — zaloguj się metodą awaryjną opisaną powyżej i zapisz nową sesję.
4. Jeśli pojawi się popup/modal — zamknij go:
   ```javascript
   try {
     await page.locator('a:has-text("Close")').waitFor({ timeout: 3000 });
     await page.locator('a:has-text("Close")').click();
   } catch {}
   ```
5. Kliknij "Saldo" w górnym menu nawigacyjnym.
6. Kliknij "tabela" w lewym panelu bocznym (lista SZCZEGÓŁOWOŚĆ).
7. Zrób pełnostronicowy zrzut ekranu (fullPage: true).
8. Pod pierwszą tabelą od góry znajdź link/przycisk "Zapisz do PDF" i pobierz plik PDF
   (użyj JavaScript fetch() z credentials: 'include' na URL tego linku, zdekoduj base64 i
   zapisz jako plik binarny).
9. Ustal aktualną datę i godzinę w formacie RRRR-MM-DD_HH-MM (np. 2026-06-01_21-52).
10. Odczytaj zmienną środowiskową OUTPUT_BASE_DIR. Jeśli nie jest ustawiona, użyj jako fallback
    ścieżki względnej claude_code_results w bieżącym katalogu roboczym.
11. Zapisz zrzut ekranu jako saldo_tabela.png i PDF jako saldo_tabela.pdf w folderze:
    <OUTPUT_BASE_DIR>/Lubostron 15A/<data_godzina>/
    (utwórz cały folder jeśli nie istnieje).
