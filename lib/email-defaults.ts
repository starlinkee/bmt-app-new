// Domyślne (neutralne, bez nazwy firmy) teksty e-maili, używane gdy konto lub grupa
// rozliczeniowa nie ma własnego szablonu. Wspólne dla lib/email.ts (wysyłka) i stron
// (placeholdery, wartości startowe formularzy) - dlatego bez 'use server' i 'server-only'.
// Szablony konta właściciela sprzed slice 4a zostały w bazie wypełnione dawnymi tekstami
// (migracja 20261021090000), więc zmiana tych stałych nie zmienia jego e-maili.

export const DEFAULT_RENT_EMAIL_SUBJECT = 'Faktura czynszu {numer_rachunku}'
export const DEFAULT_RENT_EMAIL_BODY =
  'Szanowny/a {najemca},\n\nW załączeniu faktura za czynsz nr {numer_rachunku} za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy'

export const DEFAULT_MEDIA_EMAIL_SUBJECT = 'Faktura media {numer_rachunku}'
export const DEFAULT_MEDIA_EMAIL_BODY =
  'Szanowny/a {imie},\nW załączeniu rozliczenie mediów nr {numer_rachunku} za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy'
// Wartość startowa szablonu w formularzu grupy rozliczeniowej (bez numeru rachunku).
export const DEFAULT_MEDIA_GROUP_EMAIL_BODY =
  'Szanowny/a {imie},\nW załączeniu rozliczenie mediów za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy'

export const DEFAULT_STATEMENT_EMAIL_SUBJECT = 'Rozliczenie wpłat i rachunków'
export const DEFAULT_STATEMENT_EMAIL_BODY =
  'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy'

export const DEFAULT_STATEMENT_UPLOAD_REMINDER_SUBJECT = 'Przypomnienie: wgraj wyciąg z banku'
export const DEFAULT_STATEMENT_UPLOAD_REMINDER_BODY =
  'Przypomnienie automatyczne z systemu rozliczeń.\n\nDzisiaj 16. dzień miesiąca — czas wgrać wyciąg z konta bankowego do systemu (sekcja Import).\n\nPozdrawiamy'

export const DEFAULT_METER_READING_REMINDER_SUBJECT = 'Przypomnienie: podaj odczyty liczników'
export const DEFAULT_METER_READING_REMINDER_BODY =
  'Szanowny/a {imie},\n\nDzisiaj ostatni dzień miesiąca — prosimy o podanie odczytów liczników mediów pod poniższym linkiem:\n{link}\n\nPozdrawiamy'
