import { getAutomationStatus } from './actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatDateTime } from '@/lib/utils'
import { Mail, CalendarClock, Upload, ClipboardList, Gauge, Receipt } from 'lucide-react'

export const dynamic = 'force-dynamic'

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5">
      {label}: <strong className="text-foreground font-medium">{value}</strong>
    </p>
  )
}

export default async function AutomatyzacjePage() {
  const status = await getAutomationStatus()

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div className="pb-4 border-b">
        <h1 className="text-2xl font-semibold tracking-tight">Automatyzacje i maile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wyłącznie do odczytu — spis tego, co aplikacja wysyła sama, oraz co można wysłać ręcznie.
          Opis odpowiada aktualnemu stanowi kodu.
        </p>
      </div>

      {/* 1. Przypomnienie o wgraniu wyciągu — 16. dnia */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Przypomnienie o wgraniu wyciągu bankowego (16. dnia miesiąca)
          </CardTitle>
          <CardDescription>Automatyczne, uruchamiane przez harmonogram (cron) na Vercelu</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Codziennie o 8:00 Vercel odpytuje endpoint <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/cron/statement-reminder</code>,
            ale mail wychodzi tylko dokładnie <strong>16. dnia miesiąca</strong> — w pozostałe dni nic się nie dzieje.
            Zabezpieczenie w kodzie pilnuje też, żeby nie wysłać go dwa razy w tym samym miesiącu.
          </p>
          <p>
            Mail trafia do stałego adresu administratora ze zmiennej środowiskowej{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">APP_ADMIN_EMAIL</code> (nie do najemców) —
            to przypomnienie, żeby wgrać do zakładki <strong>Import</strong> aktualny wyciąg: 1 plik CSV
            (Pekao) oraz 2 pliki PDF (Millennium, poprzedni i bieżący miesiąc).
          </p>
          <StatusLine
            label="Adres administratora"
            value={status.adminEmail ?? 'nieustawiony (APP_ADMIN_EMAIL brak w konfiguracji środowiska — mail się nie wyśle)'}
          />
          <StatusLine
            label="Ostatnio wysłane"
            value={status.lastUploadReminderSentAt ? formatDateTime(status.lastUploadReminderSentAt) : 'jeszcze nigdy (brak wpisu w historii)'}
          />
        </CardContent>
      </Card>

      {/* 2. Automatyczne ponaglenia po imporcie */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Ponaglenia do zalegających najemców — po każdym imporcie wyciągu
          </CardTitle>
          <CardDescription>Automatyczne, ale wyzwalane Twoją akcją, nie harmonogramem</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            To nie osobny cron, tylko krok na końcu <strong>każdego</strong> importu wyciągu w zakładce Import
            (CSV albo para PDF-ów). Po zapisaniu transakcji aplikacja sprawdza najemców z ujemnym saldem,
            ale tylko <strong>po 15. dniu miesiąca</strong> — wcześniej krok nic nie robi.
          </p>
          <p>
            Każdemu zalegającemu najemcy z adresem e-mail wysyła mail z podsumowaniem konta i PDF-em
            wyciągu (na oba adresy, jeśli ma dwa), maksymalnie <strong>raz w miesiącu</strong> — kolejny
            import w tym samym miesiącu go pominie. Temat i treść edytuje się w <strong>Ustawieniach</strong>
            („Mail z rozliczeniem / wyciągiem z konta”).
          </p>
          <StatusLine
            label="Ostatnio wysłano komuś taki mail"
            value={status.lastLateReminderSentAt ? formatDateTime(status.lastLateReminderSentAt) : 'jeszcze nigdy (brak wpisu w historii)'}
          />
          {status.lateReminderSubject && (
            <StatusLine label="Aktualny temat maila" value={status.lateReminderSubject} />
          )}
        </CardContent>
      </Card>

      {/* 3. Ręczna wysyłka z Kontroli płatności */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Ręczna wysyłka wyciągu do wybranego najemcy
          </CardTitle>
          <CardDescription>Nieautomatyczne — wysyłasz sam(a), kiedy chcesz</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            W zakładce <strong>Kontrola płatności</strong>, przy każdym najemcy, jest przycisk z ikoną koperty
            (<Mail className="inline h-3.5 w-3.5 align-text-bottom" /> „Wyślij podsumowanie do tego najemcy”).
            Wysyła dokładnie ten sam mail co automatyczne ponaglenie wyżej (ten sam szablon i PDF), ale
            natychmiast i bez limitu „raz w miesiącu” — wygodny sposób, żeby dosłać wyciąg na żądanie.
          </p>
        </CardContent>
      </Card>

      {/* 4. Media */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Noty obciążeniowe za media
          </CardTitle>
          <CardDescription>Wysyłka jest częścią akcji „Rozlicz media” — nie działa sama z siebie</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Gdy w zakładce <strong>Rozlicz media</strong> uruchomisz rozliczenie grupy, aplikacja dla każdego
            najemcy z adresem e-mail kopiuje szablon Google Sheets z Ustawień, wypełnia go kwotami,
            eksportuje jako PDF („nota obciążeniowa”) i wysyła mailem — jednym kliknięciem. Wygląd noty
            pochodzi w całości z arkusza, nie z kodu aplikacji.
          </p>
        </CardContent>
      </Card>

      {/* 5. Przypomnienie o odczytach liczników — ostatni dzień miesiąca */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Przypomnienie o odczytach liczników (ostatni dzień miesiąca)
          </CardTitle>
          <CardDescription>Automatyczne, uruchamiane przez harmonogram (cron) na Vercelu</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Codziennie o 8:00 Vercel odpytuje endpoint{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/cron/meter-reading-reminder</code>,
            ale mail wychodzi tylko w <strong>ostatnim dniu miesiąca</strong> — w pozostałe dni nic się nie
            dzieje. Zabezpieczenie w kodzie pilnuje, żeby nie wysłać go dwa razy w tym samym miesiącu.
            Choć mail idzie tego samego dnia, odczyt wprowadzony kilka dni później i tak trafia do tego
            samego miesiąca rozliczeniowego (formularz odczytów sam to ustala).
          </p>
          <p>
            Odbiorcy są wyliczani automatycznie — to najemcy z aktywną umową na media, którzy mają
            przypisane klucze odczytów (<strong>tenant_reading_keys</strong>) w swojej grupie
            rozliczeniowej (ta sama grupa co lista „Kopiuj link” w zakładce Najemcy). Każdy dostaje mail ze
            spersonalizowanym linkiem do swojego formularza odczytów. Temat i treść edytuje się w{' '}
            <strong>Ustawieniach</strong> („Przypomnienie o odczytach liczników”).
          </p>
          <StatusLine
            label="Ostatnio wysłane"
            value={status.lastMeterReminderSentAt ? `${formatDateTime(status.lastMeterReminderSentAt)} — ${status.lastMeterReminderInfo}` : 'jeszcze nigdy (brak wpisu w historii)'}
          />
          {status.meterReadingReminderSubject && (
            <StatusLine label="Aktualny temat maila" value={status.meterReadingReminderSubject} />
          )}
        </CardContent>
      </Card>

      {/* 6. Czynsze — generowanie 1. dnia miesiąca */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Naliczanie czynszów (1. dnia miesiąca, 8:00)
          </CardTitle>
          <CardDescription>Automatyczne, uruchamiane przez harmonogram (cron) na Vercelu — bez maili i bez PDF-ów</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            1. dnia każdego miesiąca o 8:00 Vercel odpytuje endpoint{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/cron/generate-rents</code>. Dla
            każdej aktywnej umowy powstaje rekord w tabeli rachunków (typ{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">RENT</code>, bez numeru) — potrzebny
            tylko do liczenia zadłużenia/salda w „Kontroli płatności”. Umowa z już istniejącym rachunkiem
            za dany miesiąc jest pomijana, więc ponowne odpalenie crona jest bezpieczne.
          </p>
          <p>
            Krok świadomie nie wysyła maili ani nie generuje PDF-ów — formalne fakturowanie czynszu robi
            zewnętrzny system księgowy.
          </p>
          <StatusLine
            label="Ostatnie naliczenie"
            value={status.lastRentGenerationAt ? `${formatDateTime(status.lastRentGenerationAt)} — ${status.lastRentGenerationInfo}` : 'jeszcze nigdy (brak wpisu w historii)'}
          />
        </CardContent>
      </Card>
    </div>
  )
}
