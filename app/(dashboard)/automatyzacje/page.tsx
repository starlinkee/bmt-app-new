import { getAutomationStatus } from './actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatDateTime } from '@/lib/utils'
import { Mail, CalendarClock, Upload, ClipboardList, Gauge, Receipt, AlertTriangle } from 'lucide-react'

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
          Wyłącznie do odczytu — spis wszystkiego, co aplikacja wysyła sama, oraz tego, co można wysłać ręcznie.
          Ten opis odpowiada aktualnemu stanowi kodu (nie jest to plan ani dokumentacja historyczna).
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
            ale mail faktycznie wychodzi tylko wtedy, gdy jest dokładnie <strong>16. dzień miesiąca</strong> —
            w pozostałe dni endpoint nic nie robi. Zabezpieczenie w kodzie pilnuje też, żeby nie wysłać go
            dwa razy w tym samym miesiącu, nawet gdyby cron odpalił się kilka razy.
          </p>
          <p>
            Mail trafia do jednego, stałego adresu administratora skonfigurowanego zmienną środowiskową{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">APP_ADMIN_EMAIL</code> (nie do najemców). Jego treść
            to przypomnienie, żeby tego dnia wgrać do zakładki <strong>Import</strong> aktualny wyciąg — 1 plik CSV
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
            To nie jest osobny cron — to krok wykonywany automatycznie na końcu <strong>każdego</strong> importu
            wyciągu w zakładce Import (zarówno wgrania pojedynczego pliku CSV, jak i pary plików PDF).
            Po zapisaniu transakcji aplikacja sama sprawdza wszystkich najemców z ujemnym saldem, ale
            wyłącznie jeśli jest już <strong>po 15. dniu miesiąca</strong> — we wcześniejszej części miesiąca
            krok ten nic nie robi.
          </p>
          <p>
            Dla każdego zalegającego najemcy z adresem e-mail wysyła mail z podsumowaniem konta i załączonym
            PDF-em wyciągu (na oba adresy e-mail najemcy, jeśli ma podane dwa). Do każdego najemcy taki mail
            leci maksymalnie <strong>raz w miesiącu</strong> — kolejny import w tym samym miesiącu go pominie.
            Temat i treść tego maila edytuje się w <strong>Ustawieniach</strong> (pola „Mail z rozliczeniem / wyciągiem z konta”).
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
            W zakładce <strong>Kontrola płatności</strong>, przy każdym najemcy na liście, znajduje się przycisk
            z ikoną koperty (<Mail className="inline h-3.5 w-3.5 align-text-bottom" /> „Wyślij podsumowanie do tego najemcy”).
            Kliknięcie go wysyła dokładnie ten sam mail co automatyczne ponaglenie opisane wyżej (ten sam
            szablon z Ustawień, ten sam PDF z wyciągiem) — ale natychmiast, ręcznie, niezależnie od dnia
            miesiąca i bez limitu „raz w miesiącu”. To wygodny sposób, żeby dosłać komuś wyciąg na żądanie,
            bez czekania na import czy na 15. dzień miesiąca.
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
            najemcy z adresem e-mail: kopiuje wskazany w Ustawieniach szablon Google Sheets, wypełnia go
            kwotami, eksportuje jako PDF („nota obciążeniowa”) i wysyła mailem — wszystko w ramach tego
            jednego kliknięcia. Wygląd samej noty pochodzi w całości z arkusza Google Sheets, nie z kodu
            aplikacji.
          </p>
        </CardContent>
      </Card>

      {/* 5. Czynsze — brak maili */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Czynsze (rents)
          </CardTitle>
          <CardDescription>Świadomie bez maili i bez PDF-ów</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Dla czynszu aplikacja nie wysyła żadnych maili ani nie generuje żadnych PDF-ów — to celowe.
            Jedyne, co powstaje, to rekord w tabeli rachunków (bez numeru), potrzebny tylko po to, żeby
            liczyć zadłużenie/saldo najemcy. Formalne fakturowanie czynszu robi zewnętrzny system księgowy,
            poza tą aplikacją.
          </p>
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 px-4 py-3 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
            <span className="flex-1 leading-relaxed">
              Uwaga: obecnie nic w aplikacji nie tworzy tych rekordów automatycznie co miesiąc — nie ma
              na to harmonogramu. W efekcie zadłużenie z tytułu czynszu może nie być uwzględnione w saldach
              widocznych w „Kontroli płatności”, dopóki ktoś ręcznie tego nie uzupełni.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
