import { getAutomationStatus, getAppConfig, getUpcomingRentCharges, getMediaGroupEmailPreviews } from './actions'
import { LateReminderForm, MeterReminderForm, MeterClosedMessageForm } from './settings-forms'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatDateTime, formatAmount } from '@/lib/utils'
import { Mail, CalendarClock, ClipboardList, Gauge, Receipt } from 'lucide-react'

export const dynamic = 'force-dynamic'

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5">
      {label}: <strong className="text-foreground font-medium">{value}</strong>
    </p>
  )
}

export default async function AutomatyzacjePage() {
  const [status, config, upcomingRentCharges, mediaGroupPreviews] = await Promise.all([
    getAutomationStatus(),
    getAppConfig(),
    getUpcomingRentCharges(),
    getMediaGroupEmailPreviews(),
  ])
  const cfg = (config ?? {}) as Record<string, unknown>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div className="pb-4 border-b">
        <h1 className="text-2xl font-semibold tracking-tight">Automatyzacje i maile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Co aplikacja wysyła sama, a co trzeba wysłać ręcznie.
        </p>
      </div>

      {/* Sekcja 1: maile automatyczne */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Maile automatyczne</h2>
        <p className="text-sm text-muted-foreground -mt-2">Wysyłane same, bez Twojego udziału, wg harmonogramu.</p>

        {/* Przypomnienie o wgraniu wyciągu — 16. dnia */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Przypomnienie o wgraniu wyciągu bankowego (16. dnia miesiąca)
            </CardTitle>
            <CardDescription>Automatyczne</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              16. dnia każdego miesiąca administrator dostaje maila z przypomnieniem, żeby wgrać do
              zakładki <strong>Import</strong> aktualny wyciąg: 1 plik CSV (Pekao) oraz 2 pliki PDF
              (Millennium, poprzedni i bieżący miesiąc).
            </p>
            <StatusLine
              label="Adres administratora"
              value={status.adminEmail ?? 'nieustawiony — mail się nie wyśle (ustaw w zakładce Ustawienia)'}
            />
            <StatusLine
              label="Ostatnio wysłane"
              value={status.lastUploadReminderSentAt ? formatDateTime(status.lastUploadReminderSentAt) : 'jeszcze nigdy'}
            />
          </CardContent>
        </Card>

        {/* Przypomnienie o odczytach liczników — ostatni dzień miesiąca */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Przypomnienie o odczytach liczników (ostatni dzień miesiąca)
            </CardTitle>
            <CardDescription>Automatyczne</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              W ostatnim dniu miesiąca każdy najemca z aktywną umową na media i przypisanym licznikiem
              dostaje maila z linkiem do swojego formularza odczytów.
            </p>
            <p>
              Ten link (<span className="font-mono text-xs">/odczyty/[token]</span>) to samodzielny,
              publiczny formularz najemcy — nie trzeba się logować, wystarczy unikalny token przypisany
              do najemcy. Najemca widzi tam swoje liczniki (zdefiniowane w grupie rozliczeniowej jako
              „klucze odczytów”), ostatni zapisany odczyt jako podpowiedź i pole na nowy odczyt. Po
              wysłaniu wartości trafiają wprost do tabeli odczytów w bazie i są potem używane przy
              rozliczaniu mediów — nie trzeba ich przepisywać ręcznie.
            </p>
            <p>
              Formularz jest aktywny tylko w oknie <strong>od 25. do 5. dnia miesiąca</strong> (okres
              obejmujący przełom miesięcy). Od 25. do końca miesiąca odczyt liczy się jako odczyt na
              koniec bieżącego miesiąca; od 1. do 5. — jako odczyt za miesiąc, który się właśnie
              skończył. Poza tym oknem (dni 6–24) formularz pokazuje najemcy komunikat, że jest
              tymczasowo niedostępny, i nie pozwala nic wysłać — celowo bez podawania mu dokładnego
              zakresu dat (ani w tym komunikacie, ani w mailu z przypomnieniem). Dodatkowo, gdy najemca
              już podał wszystkie swoje odczyty za dany miesiąc, widzi ekran potwierdzenia zamiast
              formularza — nie może wysłać ich drugi raz.
            </p>
            <StatusLine
              label="Ostatnio wysłane"
              value={status.lastMeterReminderSentAt ? `${formatDateTime(status.lastMeterReminderSentAt)} — ${status.lastMeterReminderInfo}` : 'jeszcze nigdy'}
            />
            <div className="text-xs text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5 space-y-1">
              <p>
                Dziś dostałby(-aby) tego maila ({status.meterReminderRecipients.length}):
              </p>
              {status.meterReminderRecipients.length === 0 ? (
                <p className="italic">brak — nikt aktualnie nie spełnia warunków</p>
              ) : (
                <ul className="space-y-0.5">
                  {status.meterReminderRecipients.map((t) => (
                    <li key={t.id}>
                      <strong className="text-foreground font-medium">{t.name}</strong>
                      {' — '}
                      <span className="font-mono">{t.emails.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <MeterReminderForm
              initialSubject={(cfg.meter_reading_reminder_subject as string) ?? 'Przypomnienie: podaj odczyty liczników'}
              initialBody={(cfg.meter_reading_reminder_body as string) ?? 'Szanowny/a {imie},\n\nDzisiaj ostatni dzień miesiąca — prosimy o podanie odczytów liczników mediów pod poniższym linkiem:\n{link}\n\nPozdrawiamy,\nBMT'}
            />
            <MeterClosedMessageForm
              initialMessage={(cfg.meter_reading_closed_message as string) ?? 'Podawanie odczytów jest teraz zamknięte. Sprawdź ponownie pod koniec miesiąca.'}
            />
          </CardContent>
        </Card>

        {/* Naliczanie czynszów — 1. dnia miesiąca (bez maila) */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Naliczanie czynszów (1. dnia miesiąca)
            </CardTitle>
            <CardDescription>Automatyczne — bez maila i bez PDF-u</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              1. dnia każdego miesiąca dla każdej aktywnej umowy powstaje w bazie zapis naliczonego
              czynszu — potrzebny do liczenia zadłużenia/salda w „Kontroli płatności”. Nic nie wysyłamy
              mailem ani jako PDF — formalną fakturę wystawia zewnętrzny system księgowy.
            </p>
            <StatusLine
              label="Ostatnie naliczenie"
              value={status.lastRentGenerationAt ? `${formatDateTime(status.lastRentGenerationAt)} — ${status.lastRentGenerationInfo}` : 'jeszcze nigdy'}
            />
            <div className="text-xs text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5 space-y-1">
              <p>
                1. {upcomingRentCharges.month}/{upcomingRentCharges.year} zostanie obciążonych
                ({upcomingRentCharges.tenants.length}):
              </p>
              {upcomingRentCharges.tenants.length === 0 ? (
                <p className="italic">brak — żadna aktywna umowa nie obejmuje tego okresu</p>
              ) : (
                <ul className="space-y-0.5">
                  {upcomingRentCharges.tenants.map((t, i) => (
                    <li key={`${t.id ?? 'null'}-${i}`}>
                      <span className="font-mono">#{t.id ?? '?'}</span>{' '}
                      <strong className="text-foreground font-medium">{t.name}</strong>
                      {' — '}
                      {t.property ?? 'brak przypisanej nieruchomości'}
                      {' — '}
                      <span className="font-mono">{formatAmount(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sekcja 2: wiadomości wysyłane ręcznie */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Wiadomości wysyłane ręcznie</h2>
        <p className="text-sm text-muted-foreground -mt-2">Wychodzą tylko wtedy, gdy klikniesz odpowiednią akcję w aplikacji.</p>

        {/* Ręczna wysyłka z Kontroli płatności */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Ręczna wysyłka wyciągu do wybranego najemcy
            </CardTitle>
            <CardDescription>Wysyłasz sam(a), kiedy chcesz</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              W zakładce <strong>Kontrola płatności</strong>, przy najemcy, jest przycisk
              (<Mail className="inline h-3.5 w-3.5 align-text-bottom" /> „Wyślij podsumowanie do tego najemcy”).
              Wysyła podsumowanie konta i PDF wyciągu na e-mail najemcy.
            </p>
            <p>
              Jest tam też przycisk zbiorczy „Wyślij do wszystkich zadłużonych” — wysyła ten sam mail
              i PDF do każdego najemcy z ujemnym saldem naraz. Oba przyciski to jedyny sposób wysyłki
              tego maila — nic nie wychodzi samo z siebie.
            </p>
            <LateReminderForm
              initialSubject={(cfg.late_reminder_subject as string) ?? 'Rozliczenie wpłat i rachunków - BMT'}
              initialBody={(cfg.late_reminder_body as string) ?? 'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT'}
            />
          </CardContent>
        </Card>

        {/* Media */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Rozliczenie mediów
            </CardTitle>
            <CardDescription>Część akcji „Rozlicz media” — nie działa samo z siebie</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Po uruchomieniu rozliczenia grupy w zakładce <strong>Rozlicz media</strong> każdy najemca
              z adresem e-mail dostaje mailem dokument rozliczeniowy (PDF wygenerowany z arkusza) z kwotą
              do zapłaty. Nie generujemy przy tym osobnej, formalnie numerowanej noty obciążeniowej — po
              zakończeniu rozliczenia widzisz w aplikacji listę kwot per najemca i wystawiasz rachunki
              ręcznie w KSeF. Treść tego maila ustawia się osobno dla każdej grupy rozliczeniowej, w jej edycji.
            </p>
            {mediaGroupPreviews.length === 0 ? (
              <p className="text-xs text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5 italic">
                brak zdefiniowanych grup rozliczeniowych
              </p>
            ) : (
              <div className="space-y-3">
                {mediaGroupPreviews.map((g) => (
                  <div key={g.groupId} className="text-xs bg-muted/40 rounded-md px-2 py-2 space-y-1.5">
                    <p className="text-foreground font-medium">{g.groupName}</p>
                    <div>
                      <p className="text-muted-foreground/80">
                        Obecnie podłączeni najemcy ({g.recipients.length}):
                      </p>
                      {g.recipients.length === 0 ? (
                        <p className="italic text-muted-foreground/80">brak — żaden najemca z tej grupy nie ma włączonych mediów</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {g.recipients.map((r) => (
                            <li key={r.id}>
                              <strong className="text-foreground font-medium">{r.name}</strong>
                              {' — '}
                              <span className="font-mono">{r.emails.join(', ')}</span>
                              {' — '}
                              {r.attachments.length === 0
                                ? 'bez załącznika PDF'
                                : `${r.attachments.length} ${r.attachments.length === 1 ? 'załącznik' : 'załączniki'} PDF: ${r.attachments.join(', ')}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground/80">Treść maila:</p>
                      <p><span className="text-muted-foreground/80">Temat:</span> {g.subject}</p>
                      <p className="whitespace-pre-line"><span className="text-muted-foreground/80">Treść:</span> {g.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
