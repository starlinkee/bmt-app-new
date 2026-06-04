Pobierz aktualne kursy walut z publicznego API Narodowego Banku Polskiego:
1. Użyj fetch() lub curl na: https://api.nbp.pl/api/exchangerates/tables/A/?format=json
2. Z odpowiedzi wyciągnij kursy: USD, EUR, GBP, CHF.
3. Ustal aktualną datę i godzinę w formacie RRRR-MM-DD_HH-MM.
4. Odczytaj zmienną środowiskową OUTPUT_BASE_DIR (użyj Bash/shell). Jeśli nie jest ustawiona, użyj: /opt/bmt-app/claude_code_results
5. Zapisz wyniki jako plik tekstowy kurs-walut.txt w folderze:
   <OUTPUT_BASE_DIR>/kurs-walut/<data_godzina>/
   (utwórz folder jeśli nie istnieje).
6. Format pliku:
   Data: <data i godzina>
   USD: <kurs> PLN
   EUR: <kurs> PLN
   GBP: <kurs> PLN
   CHF: <kurs> PLN
