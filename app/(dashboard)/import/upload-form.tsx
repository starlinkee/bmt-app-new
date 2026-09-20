'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { importBankStatement, getLastImportInfo, getLastImportSlotRange, getImportKindStatuses } from './actions'
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

function fmtDM(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Nominalny okres wyciągu CSV (Pekao): zawsze od 16. dnia jednego miesiąca do
// 15. dnia kolejnego miesiąca włącznie. WAŻNE: liczony na podstawie faktycznej
// daty transakcji z pliku (np. najwcześniejszej), a NIE daty wgrania pliku do
// aplikacji — plik można wgrać z opóźnieniem (np. w grudniu uzupełnić braki
// za czerwiec/lipiec) i wtedy ma pokazywać czerwiec/lipiec, a nie grudzień.
// Dana data zawsze należy do dokładnie jednego okna 16–15: jeśli jej dzień
// miesiąca to 16 lub więcej, okno zaczyna się w tym samym miesiącu (16.) i
// kończy w kolejnym (15.); jeśli dzień to 1–15, okno zaczęło się w
// poprzednim miesiącu (16.) i kończy się w tym samym (15.).
function windowContaining(date: Date): { start: Date; end: Date } {
  if (date.getDate() >= 16) {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 16),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 15),
    }
  }
  return {
    start: new Date(date.getFullYear(), date.getMonth() - 1, 16),
    end: new Date(date.getFullYear(), date.getMonth(), 15),
  }
}

function nominalCsvPeriodLabel(anchorDate: string | Date): string {
  const d = typeof anchorDate === 'string' ? new Date(anchorDate) : anchorDate
  const { start, end } = windowContaining(d)
  return `${fmtDM(start)} – ${fmtDM(end)}`
}

// To samo co nominalCsvPeriodLabel, ale dla jednego z dwóch osobnych PDF-ów
// (bank daje tylko pełne miesiące): dla slotu 1 (dayFrom=16, "poprzedni
// miesiąc") pokazujemy 16.–koniec miesiąca, dla slotu 2 (dayTo=15, "bieżący
// miesiąc") pokazujemy 1.–15. Miesiąc brany jest z faktycznej daty transakcji
// w danym pliku (anchorDate), nie z daty wgrania.
function nominalPdfSlotPeriodLabel(
  dayFrom: number | null,
  dayTo: number | null,
  anchorDate: string | Date,
): string {
  const d = typeof anchorDate === 'string' ? new Date(anchorDate) : anchorDate

  if (dayFrom) {
    const start = new Date(d.getFullYear(), d.getMonth(), dayFrom)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0) // ostatni dzień tego miesiąca
    return `${fmtDM(start)} – ${fmtDM(end)}`
  }
  if (dayTo) {
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth(), dayTo)
    return `${fmtDM(start)} – ${fmtDM(end)}`
  }
  return ''
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
    docSlot?: number | null
    source?: 'csv' | 'pdf'
  } | null>(null)

  const [lastImport, setLastImport] = useState<{
    minDate?: string | null
    maxDate?: string | null
    savedFileName?: string
    originalFileName?: string
    created_at?: string
    docSlot?: number | null
  } | null>(null)

  useEffect(() => {
    getLastImportInfo().then(info => {
      if (info) setLastImport(info)
    }).catch(console.error)
  }, [])

  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Kiedy wykonano ostatni import i kiedy zatwierdzono ostatni import —
  // osobno dla CSV i dla wyciągów PDF.
  const { data: kindStatuses } = useQuery({
    queryKey: ['importKindStatuses'],
    queryFn: () => getImportKindStatuses(),
  })

  // "Wykonano" = późniejsza z dat: wgrania pliku i zatwierdzenia (zatwierdzenie
  // zawsze następuje po wgraniu, więc bez tego daty wyglądałyby na sprzeczne).
  function latestOf(a?: string | null, b?: string | null) {
    return a && b ? (a > b ? a : b) : (a ?? b ?? null)
  }

  function renderApprovedLine(approvedAt: string | null | undefined) {
    return (
      <p className="text-muted-foreground">
        Ostatni zatwierdzony import:{' '}
        <strong className="text-foreground font-medium">
          {approvedAt ? formatDateTime(approvedAt) : 'brak'}
        </strong>
      </p>
    )
  }

  // --- Wgrywanie pliku CSV (sekcja główna, slot 0) ---
  // Docelowo import robiony jest 16. dnia miesiąca, a plik CSV generowany w
  // banku (Pekao SA) obejmuje okres od 16. dnia poprzedniego miesiąca do
  // 15. dnia bieżącego miesiąca włącznie — w Pekao da się wygenerować
  // wyciąg za dokładnie taki zakres dat, więc nie ma potrzeby przycinania
  // dni w aplikacji tak jak w sekcji PDF poniżej (tam bank daje tylko pełne
  // miesiące, stąd konieczność wgrywania dwóch osobnych PDF-ów i przycinania
  // ich zakresów w kodzie).

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = decodeFileText(ev.target?.result as ArrayBuffer)
      startTransition(async () => {
        const res = await importBankStatement(content, file.name, undefined, undefined, 0)
        setResult({ ...res, source: 'csv' })
        setBannerDismissed(false)
        toast.success('Import zakończony.')

        // Update last import info after successful import
        getLastImportInfo().then(info => {
          if (info) setLastImport(info)
        }).catch(console.error)
        queryClient.invalidateQueries({ queryKey: ['importHistory'] })
        queryClient.invalidateQueries({ queryKey: ['importKindStatuses'] })
      })
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // --- Wgrywanie 2 wyciągów PDF (osobne konto, format PDF, całe miesiące) ---
  // Zakres dni dla tej sekcji jest STAŁY i celowo nieedytowalny w UI: wyciąg 1
  // (poprzedni miesiąc) obejmuje zawsze od 16. dnia włącznie do końca miesiąca,
  // wyciąg 2 (bieżący miesiąc) zawsze tylko do 15. dnia włącznie. Dzięki temu
  // nawet spóźnione dostarczenie wyciągów nigdy nie policzy transakcji błędnie
  // (nie ma ryzyka nakładania się okresów ani pominięcia dni).
  const PDF_STATEMENT_1_DAY_FROM = 16
  const PDF_STATEMENT_2_DAY_TO = 15
  const [pdfFile1, setPdfFile1] = useState<File | null>(null)
  const [pdfFile2, setPdfFile2] = useState<File | null>(null)
  const [pdfPending, startPdfTransition] = useTransition()
  const fileInput1Ref = useRef<HTMLInputElement>(null)
  const fileInput2Ref = useRef<HTMLInputElement>(null)

  // Zakres dni użyty poprzednio dla każdego z 2 dokumentów PDF — dla bieżącego
  // miesiąca nie znamy jeszcze zakresu, ale poprzedni import (poprzedni miesiąc)
  // możemy podpowiedzieć.
  // undefined = jeszcze nie sprawdzono (trwa pobieranie), null = sprawdzono i nie ma historii
  const [lastPdfRange1, setLastPdfRange1] = useState<{ dayFrom: number | null; dayTo: number | null; minDate?: string | null; maxDate?: string | null; created_at?: string } | null | undefined>(undefined)
  const [lastPdfRange2, setLastPdfRange2] = useState<{ dayFrom: number | null; dayTo: number | null; minDate?: string | null; maxDate?: string | null; created_at?: string } | null | undefined>(undefined)

  function refreshLastPdfRanges() {
    getLastImportSlotRange(1).then((info) => setLastPdfRange1(info)).catch(console.error)
    getLastImportSlotRange(2).then((info) => setLastPdfRange2(info)).catch(console.error)
  }

  useEffect(() => {
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

        const res1 = await importBankStatement(content1, pdfFile1.name, PDF_STATEMENT_1_DAY_FROM, undefined, 1)
        const res2 = await importBankStatement(content2, pdfFile2.name, undefined, PDF_STATEMENT_2_DAY_TO, 2)

        const merged = {
          bank: `${res1.bank} + ${res2.bank}`,
          total: res1.total + res2.total,
          withSuggestion: res1.withSuggestion + res2.withSuggestion,
          withoutSuggestion: res1.withoutSuggestion + res2.withoutSuggestion,
          skipped: res1.skipped + res2.skipped,
          duplicates: res1.duplicates + res2.duplicates,
          minDate: [res1.minDate, res2.minDate].filter(Boolean).sort()[0] ?? null,
          maxDate: [res1.maxDate, res2.maxDate].filter(Boolean).sort().slice(-1)[0] ?? null,
          source: 'pdf' as const,
        }

        setResult(merged)
        setBannerDismissed(false)
        setPdfFile1(null)
        setPdfFile2(null)
        if (fileInput1Ref.current) fileInput1Ref.current.value = ''
        if (fileInput2Ref.current) fileInput2Ref.current.value = ''
        toast.success('Oba wyciągi PDF zostały zaimportowane.')

        getLastImportInfo().then(info => {
          if (info) setLastImport(info)
        }).catch(console.error)
        refreshLastPdfRanges()
        queryClient.invalidateQueries({ queryKey: ['importHistory'] })
        queryClient.invalidateQueries({ queryKey: ['importKindStatuses'] })
      } catch (err) {
        console.error(err)
        toast.error('Błąd podczas importu wyciągów PDF.')
      }
    })
  }

  function renderSummary() {
    if (!result) return null
    // Wyciągi PDF też pokazują nominalny okres 16.–15. (jak CSV), liczony z dat transakcji
    const nominal = result.docSlot === 0 || result.source === 'pdf'
    return (
          <CardFooter className="flex-col items-stretch gap-4 pt-4 border-t border-border/50 bg-background/50">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
              Podsumowanie importu ({result.bank}
              {nominal && (result.minDate || result.maxDate)
                ? <>, {nominalCsvPeriodLabel((result.minDate ?? result.maxDate)!)}</>
                : result.minDate && result.maxDate && <>, {result.minDate} do {result.maxDate}</>})
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                Z sugestią najemcy: <span className="font-medium text-green-600 dark:text-green-400">{result.withSuggestion}</span>
              </span>
              <span className="text-muted-foreground">
                Bez dopasowania: <span className="font-medium text-amber-600 dark:text-amber-400">{result.withoutSuggestion}</span>
              </span>
              <span className="text-muted-foreground">
                Pominięte: <span className="font-medium">{result.skipped}</span>
              </span>
              {result.duplicates > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Możliwe duplikaty: {result.duplicates}
                </span>
              )}
            </div>
            {(result.withSuggestion + result.withoutSuggestion) > 0 && (
              <Link href="/import/reconcile" className={buttonVariants({ className: 'w-full', size: 'lg' })}>
                Przejdź do zatwierdzania transakcji ({result.withSuggestion + result.withoutSuggestion})
              </Link>
            )}
          </CardFooter>
    )
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

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Wgraj wyciąg CSV (Pekao SA)
          </CardTitle>
          <CardDescription>
            Wybierz plik w formacie .csv pobrany z konta w Pekao SA. Docelowo import rób 16. dnia
            miesiąca, generując w banku plik CSV za okres od 16. dnia poprzedniego miesiąca do
            15. dnia bieżącego miesiąca włącznie.
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

          {lastImport?.created_at && (
            <div className="flex items-start gap-3 text-sm bg-muted/40 p-4 rounded-lg border border-border/50">
              <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="font-medium text-foreground">Ostatni import</p>
                <p className="text-muted-foreground">
                  Wykonano {formatDateTime(latestOf(kindStatuses?.csv.lastImportAt ?? lastImport.created_at, kindStatuses?.csv.lastApprovedAt)!)}
                </p>
                {renderApprovedLine(kindStatuses?.csv.lastApprovedAt)}
                {lastImport?.docSlot === 0 && (lastImport?.minDate || lastImport?.maxDate) ? (
                  <p className="text-muted-foreground mt-2">
                    Okres: <strong className="text-foreground font-medium">{nominalCsvPeriodLabel((lastImport.minDate ?? lastImport.maxDate)!)}</strong>
                  </p>
                ) : lastImport?.minDate && lastImport?.maxDate && (
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

        {result?.source !== 'pdf' && renderSummary()}
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Wgraj 2 wyciągi PDF (Millennium)
          </CardTitle>
          <CardDescription>
            Dla konta w Millennium, z którego pobierasz tylko pełne wyciągi miesięczne w PDF, wgraj naraz wyciąg za
            poprzedni i bieżący miesiąc. Zakres dat brany z każdego pliku jest stały i nie do zmiany: wyciąg za
            poprzedni miesiąc obejmuje zawsze transakcje od {PDF_STATEMENT_1_DAY_FROM}. dnia włącznie do końca
            miesiąca, a wyciąg za bieżący miesiąc — tylko do {PDF_STATEMENT_2_DAY_TO}. dnia włącznie. Dzięki temu
            nawet spóźnione dostarczenie wyciągów nigdy nie spowoduje błędnego policzenia transakcji.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { file: pdfFile1, setFile: setPdfFile1, label: 'Wyciąg 1 (poprzedni miesiąc)', rangeLabel: `od ${PDF_STATEMENT_1_DAY_FROM}. dnia do końca miesiąca`, ref: fileInput1Ref, lastRange: lastPdfRange1 },
              { file: pdfFile2, setFile: setPdfFile2, label: 'Wyciąg 2 (bieżący miesiąc)', rangeLabel: `do ${PDF_STATEMENT_2_DAY_TO}. dnia włącznie`, ref: fileInput2Ref, lastRange: lastPdfRange2 },
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
                  Zakres dni (stały, nieedytowalny): <strong className="text-foreground font-medium">{slot.rangeLabel}</strong>
                </p>
                {slot.lastRange === null ? (
                  <p className="text-xs text-muted-foreground/60 italic px-0.5">
                    Brak wcześniejszego importu dla tego dokumentu — nie wgrywano go jeszcze.
                  </p>
                ) : slot.lastRange ? (
                  slot.lastRange.dayFrom || slot.lastRange.dayTo ? (
                    <p className="text-xs text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5">
                      Poprzednio dla tego dokumentu:{' '}
                      <strong className="text-foreground font-medium">
                        {slot.lastRange.minDate ?? slot.lastRange.maxDate
                          ? nominalPdfSlotPeriodLabel(slot.lastRange.dayFrom, slot.lastRange.dayTo, (slot.lastRange.minDate ?? slot.lastRange.maxDate)!)
                          : `${slot.lastRange.dayFrom ?? '—'} do ${slot.lastRange.dayTo ?? '—'}`}
                      </strong>
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

          {(lastPdfRange1?.created_at || lastPdfRange2?.created_at) && (
            <div className="flex items-start gap-3 text-sm bg-muted/40 p-4 rounded-lg border border-border/50">
              <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="font-medium text-foreground">Ostatni import</p>
                {(() => {
                  const latest = [lastPdfRange1, lastPdfRange2]
                    .filter((r): r is { dayFrom: number | null; dayTo: number | null; minDate?: string | null; maxDate?: string | null; created_at?: string } => !!r?.created_at)
                    .sort((a, b) => (a.created_at! > b.created_at! ? -1 : 1))[0]
                  if (!latest?.created_at) return null
                  const anchor = latest.minDate ?? latest.maxDate
                  return (
                    <>
                      <p className="text-muted-foreground">
                        Wykonano {formatDateTime(latestOf(kindStatuses?.pdf.lastImportAt ?? latest.created_at, kindStatuses?.pdf.lastApprovedAt)!)}
                      </p>
                      {renderApprovedLine(kindStatuses?.pdf.lastApprovedAt)}
                      {anchor && (
                        <p className="text-muted-foreground mt-2">
                          Okres: <strong className="text-foreground font-medium">{nominalCsvPeriodLabel(anchor)}</strong>
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </CardContent>
        {result?.source === 'pdf' && renderSummary()}
      </Card>

      <div className="pt-8 border-t">
        <ImportHistoryTable />
      </div>
    </div>
  )
}
