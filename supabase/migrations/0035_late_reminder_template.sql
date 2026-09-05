ALTER TABLE app_config
ADD COLUMN late_reminder_subject TEXT NOT NULL DEFAULT 'Rozliczenie wpłat i rachunków - BMT',
ADD COLUMN late_reminder_body TEXT NOT NULL DEFAULT 'Szanowny/a {imie},

Przesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.

Prosimy o uregulowanie należności.

Pozdrawiamy,
BMT';
