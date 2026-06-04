Pobierz aktualne kursy walut z publicznego API Narodowego Banku Polskiego:
1. Użyj fetch() lub curl na: https://api.nbp.pl/api/exchangerates/tables/A/?format=json
2. Z odpowiedzi wyciągnij kursy: USD, EUR, GBP, CHF.
3. Ustal aktualną datę i godzinę w formacie RRRR-MM-DD_HH-MM.
4. Odczytaj zmienną środowiskową OUTPUT_BASE_DIR (użyj Bash/shell). Jeśli nie jest ustawiona, użyj: /opt/bmt-app/claude_code_results
5. Zapisz wyniki jako plik tekstowy kurs-walut.txt w folderze:
   <OUTPUT_BASE_DIR>/kurs-walut_<data_godzina>/
   WAŻNE: katalog kurs-walut_<data_godzina> twórz BEZPOŚREDNIO w OUTPUT_BASE_DIR (nie zagnieżdżaj w podkatalogu kurs-walut/).
   Przykład: /opt/bmt-app/claude_code_results/kurs-walut_2026-06-04_17-29/kurs-walut.txt
   (utwórz folder mkdir -p jeśli nie istnieje).
6. Format pliku:
   Data: <data i godzina>
   USD: <kurs> PLN
   EUR: <kurs> PLN
   GBP: <kurs> PLN
   CHF: <kurs> PLN
