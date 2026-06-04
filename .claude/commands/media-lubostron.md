Używając Playwright w trybie HEADLESS (przeglądarka niewidoczna, bez GUI, bez okna —
oszczędność zasobów):

## Środowisko

Playwright jest dostępny jako moduł Python: `from playwright.sync_api import sync_playwright`
Uruchamiaj skrypty przez: `python3 /tmp/nazwa_skryptu.py`

Dane logowania pobieraj ze zmiennych środowiskowych (NIE hardcoduj w skrypcie):
- login: `os.environ["MMSOFT_LOGIN"]`
- hasło: `os.environ["MMSOFT_PASSWORD"]`

## Kroki

1. Przejdź na https://mmsoft.com.pl/lokale.php?Adm=1
2. Wypełnij pola formularza danymi z env i kliknij przycisk "Zaloguj".
3. Zrób screenshot diagnostyczny i odczytaj go żeby sprawdzić czy login się udał
   (URL powinien się zmienić lub zniknąć formularz logowania).
4. Jeśli pojawi się popup/modal — zamknij go przez JS:
   ```js
   document.querySelector('.fancybox-close, a[title="Close"]')?.click()
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
