Używając Playwright w trybie HEADLESS (przeglądarka niewidoczna, bez GUI, bez okna —
oszczędność zasobów):

1. Przejdź na https://mmsoft.com.pl/lokale.php?Adm=1
2. Zaloguj się wpisując dane z zmiennych środowiskowych:
   - login: wartość zmiennej MMSOFT_LOGIN
   - hasło: wartość zmiennej MMSOFT_PASSWORD
   Wypełnij pola formularza i kliknij przycisk "Zaloguj".
3. Jeśli pojawi się popup/modal "UWAGA" — zamknij go klikając link "Close".
4. Kliknij "Saldo" w górnym menu nawigacyjnym.
5. Kliknij "tabela" w lewym panelu bocznym (lista SZCZEGÓŁOWOŚĆ).
6. Zrób pełnostronicowy zrzut ekranu (fullPage: true).
7. Pod pierwszą tabelą od góry znajdź link/przycisk "Zapisz do PDF" i pobierz plik PDF
   (użyj JavaScript fetch() z credentials: 'include' na URL tego linku, zdekoduj base64 i
   zapisz jako plik binarny).
8. Ustal aktualną datę i godzinę w formacie RRRR-MM-DD_HH-MM (np. 2026-06-01_21-52).
9. Odczytaj zmienną środowiskową OUTPUT_BASE_DIR. Jeśli nie jest ustawiona, użyj jako fallback
   ścieżki względnej claude_code_results w bieżącym katalogu roboczym (czyli tam gdzie działa
   proces — na Windows i Linux da to poprawny wynik bo Claude jest uruchamiany z WORK_DIR).
10. Zapisz zrzut ekranu jako saldo_tabela.png i PDF jako saldo_tabela.pdf w folderze:
    <OUTPUT_BASE_DIR>/Lubostron 15A/<data_godzina>/
    (utwórz cały folder jeśli nie istnieje, używając mkdir -p lub odpowiednika).
