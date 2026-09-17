import { getAutomationStatus, getAppConfig } from './actions'
import { LateReminderForm, MeterReminderForm } from './settings-forms'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatDateTime } from '@/lib/utils'
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
  const [status, config] = await Promise.all([getAutomationStatus(), getAppConfig()])
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
            <StatusLine
              label="Ostatnio wysłane"
              value={status.lastMeterReminderSentAt ? `${formatDateTime(status.lastMeterReminderSentAt)} — ${status.lastMeterReminderInfo}` : 'jeszcze nigdy'}
            />
            <MeterReminderForm
              initialSubject={(cfg.meter_reading_reminder_subject as string) ?? 'Przypomnienie: podaj odczyty liczników'}
              initialBody={(cfg.meter_reading_reminder_body as string) ?? 'Szanowny/a {imie},\n\nDzisiaj ostatni dzień miesiąca — prosimy o podanie odczytów liczników mediów pod poniższym linkiem:\n{link}\n\nPozdrawiamy,\nBMT'}
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
              Wysyła podsumowanie konta i PDF wyciągu na e-mail najemcy. To jedyny sposób wysyłki tego maila.
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
              z adresem e-mail dostaje podsumowanie rozliczenia z informacją, że faktura jest dostępna w KSeF.
              Treść tego maila ustawia się osobno dla każdej grupy rozliczeniowej, w jej edycji.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
