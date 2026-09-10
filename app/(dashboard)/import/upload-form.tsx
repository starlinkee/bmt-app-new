'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { importBankStatement, getLastImportInfo, getLastImportSlotRange, getStatementCutoffDay } from './actions'
import { formatDateTime } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { AlertTriangle, X, Info, UploadCloud, FileSpreadsheet, FileText, CheckCircle2 } from 'lucide-react'
import { ImportHistoryTable } from './import-history-table'

// Wiele polskich wyciągów bankowych w CSV (m.in. Pekao) jest eksportowanych w
// kodowaniu Windows-1250, a nie UTF-8. Wymuszenie odczytu jako UTF-8 na takim
// pliku po cichu psuje polskie znaki w nagłówkach (np. "źródłowy" → krzaki),
// przez co rozpoznawanie formatu banku w parseCsv (dopasowanie nagłówków
// kolumn) zawodzi dla KAŻDEGO wiersza — cały plik ląduje jako "Pominięte".
// Próbujemy więc najpierw ściśle zdekodować jako UTF-8 (fatal: true rzuca
// błąd na nieprawidłowej sekwencji bajtów) i dopiero gdy to się nie uda,
// wracamy do Windows-1250.
function decodeFileText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1250').decode(buffer)
  }
}

export function UploadForm() {
  const [result, setResult] = useState<{
    bank: string
    total: number
    withSuggestion: number
    withoutSuggestion: number
    skipped: number
    duplicates: number
    minDate?: string | null
    maxDate?: string | null
    savedFileName?: string
  } | null>(null)
  
  const [lastImport, setLastImport] = useState<{
    minDate?: string | null
    maxDate?: string | null
    savedFileName?: string
    originalFileName?: string
    created_at?: string
  } | null>(null)

  useEffect(() => {
    getLastImportInfo().then(info => {
      if (info) setLastImport(info)
    }).catch(console.error)
  }, [])

  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1)

  // Dzień graniczny skonfigurowany w Ustawieniach (domyślnie 15) — używany do
  // podpowiadania zakresu dni dla dokumentu (zwykle: od 16. dnia poprzedniego
  // miesiąca do 15. dnia bieżącego).
  const [cutoffInfo, setCutoffInfo] = useState<{ cutoffDay: number; suggestedDayFrom: number; suggestedDayTo: number } | null>(null)

  // --- Wgrywanie pliku CSV (sekcja główna, slot 0) ---
  // Zakres dni NIE jest tu podpowiadany automatycznie — zależy wyłącznie od
  // tego, jaki zakres użytkownik sam wybrał przy generowaniu pliku CSV w banku.
  const [csvDayFrom, setCsvDayFrom] = useState<number | ''>('')
  const [csvDayTo, setCsvDayTo] = useState<number | ''>('')

  useEffect(() => {
    getStatementCutoffDay().then((info) => {
      setCutoffInfo(info)
      // Zakres dni dla tego dokumentu NIE jest automatycznie podpowiadany —
      // zależy od tego, jaki zakres użytkownik sam wygenerował w CSV z banku.
      // Wskazówka (16.–15.) jest tylko tekstową instrukcją w opisie karty.
    }).catch(console.error)
  }, [])

  // undefined = jeszcze nie sprawdzono (trwa pobieranie), null = sprawdzono i nie ma historii
  const [lastCsvRange, setLastCsvRange] = useState<{ dayFrom: number | null; dayTo: number | null; created_at?: string } | null | undefined>(undefined)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = decodeFileText(ev.target?.result as ArrayBuffer)
      startTransition(async () => {
        const res = await importBankStatement(content, file.name, csvDayFrom || undefined, csvDayTo || undefined, 0)
        setResult(res)
        setBannerDismissed(false)
        toast.success('Import zakończony.')

        // Update last import info after successful import
        getLastImportInfo().then(info => {
          if (info) setLastImport(info)
        }).catch(console.error)
        getLastImportSlotRange(0).then((info) => setLastCsvRange(info)).catch(console.error)
      })
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // --- Wgrywanie 2 wyciągów PDF (osobne konto, format PDF, całe miesiące) ---
  const [pdfFile1, setPdfFile1] = useState<File | null>(null)
  const [pdfFile2, setPdfFile2] = useState<File | null>(null)
  const [pdfFrom1, setPdfFrom1] = useState<number | ''>('')
  const [pdfTo1, setPdfTo1] = useState<number | ''>('')
  const [pdfFrom2, setPdfFrom2] = useState<number | ''>('')
  const [pdfTo2, setPdfTo2] = useState<number | ''>('')
  const [pdfPending, startPdfTransition] = useTransition()
  const fileInput1Ref = useRef<HTMLInputElement>(null)
  const fileInput2Ref = useRef<HTMLInputElement>(null)

  // Zakres dni użyty poprzednio dla każdego z 2 dokumentów PDF — dla bieżącego
  // miesiąca nie znamy jeszcze zakresu, ale poprzedni import (poprzedni miesiąc)
  // możemy podpowiedzieć.
  // undefined = jeszcze nie sprawdzono (trwa pobieranie), null = sprawdzono i nie ma historii
  const [lastPdfRange1, setLastPdfRange1] = useState<{ dayFrom: number | null; dayTo: number | null; created_at?: string } | null | undefined>(undefined)
  const [lastPdfRange2, setLastPdfRange2] = useState<{ dayFrom: number | null; dayTo: number | null; created_at?: string } | null | undefined>(undefined)

  function refreshLastPdfRanges() {
    getLastImportSlotRange(1).then((info) => setLastPdfRange1(info)).catch(console.error)
    getLastImportSlotRange(2).then((info) => setLastPdfRange2(info)).catch(console.error)
  }

  useEffect(() => {
    getLastImportSlotRange(0).then((info) => setLastCsvRange(info)).catch(console.error)
    refreshLastPdfRanges()
  }, [])

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (ev) => resolve(ev.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function handlePdfImport() {
    if (!pdfFile1 || !pdfFile2) return

    startPdfTransition(async () => {
      try {
        const [content1, content2] = await Promise.all([
          readFileAsDataUrl(pdfFile1),
          readFileAsDataUrl(pdfFile2),
        ])

        const res1 = await importBankStatement(content1, pdfFile1.name, pdfFrom1 || undefined, pdfTo1 || undefined, 1)
        const res2 = await importBankStatement(content2, pdfFile2.name, pdfFrom2 || undefined, pdfTo2 || undefined, 2)

        const merged = {
          bank: `${res1.bank} + ${res2.bank}`,
          total: res1.total + res2.total,
          withSuggestion: res1.withSuggestion + res2.withSuggestion,
          withoutSuggestion: res1.withoutSuggestion + res2.withoutSuggestion,
          skipped: res1.skipped + res2.skipped,
          duplicates: res1.duplicates + res2.duplicates,
          minDate: [res1.minDate, res2.minDate].filter(Boolean).sort()[0] ?? null,
          maxDate: [res1.maxDate, res2.maxDate].filter(Boolean).sort().slice(-1)[0] ?? null,
        }

        setResult(merged)
        setBannerDismissed(false)
        setPdfFile1(null)
        setPdfFile2(null)
        setPdfFrom1('')
        setPdfTo1('')
        setPdfFrom2('')
        setPdfTo2('')
        if (fileInput1Ref.current) fileInput1Ref.current.value = ''
        if (fileInput2Ref.current) fileInput2Ref.current.value = ''
        toast.success('Oba wyciągi PDF zostały zaimportowane.')

        getLastImportInfo().then(info => {
          if (info) setLastImport(info)
        }).catch(console.error)
        refreshLastPdfRanges()
      } catch (err) {
        console.error(err)
        toast.error('Błąd podczas importu wyciągów PDF.')
      }
    })
  }

  const showDuplicateBanner =
    result && result.duplicates > 0 && !bannerDismissed

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import wyciągów</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Wgraj plik z historią rachunku bankowego, aby zaimportować transakcje.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/import/history" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Historia transakcji
          </Link>
        </div>
      </div>

      {showDuplicateBanner && (
        <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/20 px-4 py-3 text-sm text-orange-800 dark:text-orange-300">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-orange-600 dark:text-orange-500" />
          <span className="flex-1 leading-relaxed">
            Wykryto <strong className="font-semibold">{result.duplicates}</strong> potencjalnych duplikatów — transakcje o tej samej dacie, kwocie i numerze konta już istnieją w bazie. Możesz je mimo to zatwierdzić lub odrzucić na kolejnym ekranie.
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 rounded-md p-1 opacity-60 hover:opacity-100 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" />
              Wgraj wyciąg CSV (Pekao SA)
            </CardTitle>
            <CardDescription>
              Wybierz plik w formacie .csv pobrany z konta w Pekao SA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                pending ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-base font-medium mb-1">
                {pending ? 'Przetwarzanie pliku...' : 'Wybierz plik z dysku'}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Obsługiwany format: CSV
              </p>

              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={pending}
                className="w-full sm:w-auto"
              >
                {pending ? 'Importowanie...' : 'Wybierz plik CSV'}
              </Button>
              <input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFile}
                disabled={pending}
                className="hidden"
              />
            </div>

            <div className="space-y-2 rounded-lg border border-border/50 p-4">
              <p className="text-sm font-medium">Zakres dni brany z pliku</p>
              <p className="text-xs text-muted-foreground">
                Opcjonalnie ogranicz zakres do dni miesiąca — przydatne, gdy okres rozliczeniowy
                nie pokrywa się z pełnym miesiącem kalendarzowym. Wybór zakresu zależy od tego,
                jaki okres wybrano przy generowaniu pliku CSV w banku.
              </p>
              <p className="text-xs text-muted-foreground/80 italic">
                Zalecany sposób pracy: import rób 16. dnia miesiąca, generując w banku CSV
                za okres od 16. dnia poprzedniego miesiąca do 15. dnia bieżącego miesiąca.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Od dnia</span>
                  <select
                    value={csvDayFrom}
                    disabled={pending}
                    onChange={(e) => setCsvDayFrom(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {DAYS_OF_MONTH.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Do dnia</span>
                  <select
                    value={csvDayTo}
                    disabled={pending}
                    onChange={(e) => setCsvDayTo(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {DAYS_OF_MONTH.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>
              </div>
              {lastCsvRange === null ? (
                <p className="text-xs text-muted-foreground/60 italic px-0.5">
                  Brak wcześniejszego importu dla tego dokumentu — nie wgrywano go jeszcze.
                </p>
              ) : lastCsvRange ? (
                lastCsvRange.dayFrom || lastCsvRange.dayTo ? (
                  <p className="text-xs text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5">
                    Poprzednio dla tego dokumentu: <strong className="text-foreground font-medium">{lastCsvRange.dayFrom ?? '—'}</strong>
                    {' '}do{' '}
                    <strong className="text-foreground font-medium">{lastCsvRange.dayTo ?? '—'}</strong>
                    {lastCsvRange.created_at && (
                      <> ({formatDateTime(lastCsvRange.created_at)})</>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic px-0.5">
                    Przy poprzednim imporcie tego dokumentu nie ograniczano zakresu dni.
                  </p>
                )
              ) : null}
            </div>

            {lastImport?.created_at && (
              <div className="flex items-start gap-3 text-sm bg-muted/40 p-4 rounded-lg border border-border/50">
                <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Ostatni import</p>
                  <p className="text-muted-foreground">
                    Wykonano {formatDateTime(lastImport.created_at)}
                  </p>
                  {lastImport?.minDate && lastImport?.maxDate && (
                    <p className="text-muted-foreground mt-2">
                      Okres: <strong className="text-foreground font-medium">{lastImport.minDate}</strong> – <strong className="text-foreground font-medium">{lastImport.maxDate}</strong>
                    </p>
                  )}
                  {(lastImport.originalFileName || lastImport.savedFileName) && (
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      Plik: {lastImport.originalFileName || lastImport.savedFileName?.replace('import_', '').substring(0, 12) + '...'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {result ? (
          <Card className="shadow-sm border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
                Podsumowanie importu
              </CardTitle>
              <CardDescription>
                Plik został pomyślnie wczytany i przetworzony
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div className="text-muted-foreground">Bank</div>
                  <div className="font-medium">{result.bank}</div>
                  
                  {result.minDate && result.maxDate && (
                    <>
                      <div className="text-muted-foreground">Okres</div>
                      <div className="font-medium">{result.minDate} <span className="text-muted-foreground font-normal mx-1">do</span> {result.maxDate}</div>
                    </>
                  )}
                  
                  <div className="col-span-2 my-2 border-t border-border/50"></div>
                  
                  <div className="text-muted-foreground flex items-center">
                    Z sugestią najemcy
                  </div>
                  <div className="font-medium text-green-600 dark:text-green-400">
                    {result.withSuggestion}
                  </div>
                  
                  <div className="text-muted-foreground">
                    Bez dopasowania
                  </div>
                  <div className="font-medium text-amber-600 dark:text-amber-400">
                    {result.withoutSuggestion}
                  </div>
                  
                  <div className="text-muted-foreground">
                    Pominięte <span className="text-xs opacity-70">(wychodzące/błędy)</span>
                  </div>
                  <div className="font-medium">
                    {result.skipped}
                  </div>

                  {result.duplicates > 0 && (
                    <>
                      <div className="text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5 mt-2">
                        Możliwe duplikaty
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </div>
                      <div className="font-medium text-red-600 dark:text-red-400 mt-2">
                        {result.duplicates}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
            {(result.withSuggestion + result.withoutSuggestion) > 0 && (
              <CardFooter className="pt-4 border-t border-border/50 bg-background/50">
                <Link href="/import/reconcile" className={buttonVariants({ className: 'w-full', size: 'lg' })}>
                  Przejdź do zatwierdzania transakcji ({result.withSuggestion + result.withoutSuggestion})
                </Link>
              </CardFooter>
            )}
          </Card>
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full min-h-[300px] rounded-xl border border-dashed border-border/50 bg-muted/20 text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm">Wynik importu pojawi się tutaj po wgraniu pliku</p>
          </div>
        )}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Wgraj 2 wyciągi PDF (Millennium)
          </CardTitle>
          <CardDescription>
            Dla konta w Millennium, z którego pobierasz tylko pełne wyciągi miesięczne w PDF, wgraj naraz wyciąg za
            poprzedni i bieżący miesiąc. Możesz opcjonalnie ograniczyć zakres dat brany z każdego pliku
            {cutoffInfo ? (
              <> (np. poprzedni miesiąc: od {cutoffInfo.suggestedDayFrom}., bieżący: do {cutoffInfo.suggestedDayTo}.)</>
            ) : null}, żeby uniknąć nakładających się transakcji. Dzień graniczny można zmienić w Ustawieniach.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { file: pdfFile1, setFile: setPdfFile1, from: pdfFrom1, setFrom: setPdfFrom1, to: pdfTo1, setTo: setPdfTo1, label: 'Wyciąg 1 (np. poprzedni miesiąc)', ref: fileInput1Ref, lastRange: lastPdfRange1 },
              { file: pdfFile2, setFile: setPdfFile2, from: pdfFrom2, setFrom: setPdfFrom2, to: pdfTo2, setTo: setPdfTo2, label: 'Wyciąg 2 (np. bieżący miesiąc)', ref: fileInput2Ref, lastRange: lastPdfRange2 },
            ].map((slot, idx) => (
              <div key={idx} className="space-y-3 rounded-lg border border-border/50 p-4">
                <p className="text-sm font-medium">{slot.label}</p>
                <div
                  onClick={() => !pdfPending && slot.ref.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                    pdfPending ? 'border-primary/50 bg-primary/5 cursor-not-allowed' : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="mx-auto w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  {slot.file ? (
                    <p className="text-sm font-medium truncate">{slot.file.name}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Kliknij, aby wybrać plik PDF</p>
                  )}
                </div>
                <input
                  ref={slot.ref}
                  type="file"
                  accept=".pdf"
                  disabled={pdfPending}
                  onChange={(e) => slot.setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground">
                  Opcjonalnie ogranicz zakres do dni miesiąca (Ty wiesz, ile dni ma dany miesiąc)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Od dnia</span>
                    <select
                      value={slot.from}
                      disabled={pdfPending}
                      onChange={(e) => slot.setFrom(e.target.value ? Number(e.target.value) : '')}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {DAYS_OF_MONTH.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Do dnia</span>
                    <select
                      value={slot.to}
                      disabled={pdfPending}
                      onChange={(e) => slot.setTo(e.target.value ? Number(e.target.value) : '')}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {DAYS_OF_MONTH.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {slot.lastRange === null ? (
                  <p className="text-xs text-muted-foreground/60 italic px-0.5">
                    Brak wcześniejszego importu dla tego dokumentu — nie wgrywano go jeszcze.
                  </p>
                ) : slot.lastRange ? (
                  slot.lastRange.dayFrom || slot.lastRange.dayTo ? (
                    <p className="text-xs text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5">
                      Poprzednio dla tego dokumentu: <strong className="text-foreground font-medium">{slot.lastRange.dayFrom ?? '—'}</strong>
                      {' '}do{' '}
                      <strong className="text-foreground font-medium">{slot.lastRange.dayTo ?? '—'}</strong>
                      {slot.lastRange.created_at && (
                        <> ({formatDateTime(slot.lastRange.created_at)})</>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 italic px-0.5">
                      Przy poprzednim imporcie tego dokumentu nie ograniczano zakresu dni.
                    </p>
                  )
                ) : null}
              </div>
            ))}
          </div>
          <Button
            onClick={handlePdfImport}
            disabled={!pdfFile1 || !pdfFile2 || pdfPending}
            className="w-full sm:w-auto"
          >
            {pdfPending ? 'Importowanie...' : 'Zatwierdź i zaimportuj oba PDF'}
          </Button>
        </CardContent>
      </Card>

      <div className="pt-8 border-t">
        <ImportHistoryTable />
      </div>
    </div>
  )
}
