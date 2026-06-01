'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { importCsvTransactions } from './actions'
import { Label } from '@/components/ui/label'
import { History, AlertTriangle, X } from 'lucide-react'

export default function ImportPage() {
  const [result, setResult] = useState<{
    bank: string
    total: number
    withSuggestion: number
    withoutSuggestion: number
    skipped: number
    duplicates: number
  } | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      startTransition(async () => {
        const res = await importCsvTransactions(content)
        setResult(res)
        setBannerDismissed(false)
        toast.success('Import zakończony.')
      })
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const showDuplicateBanner =
    result && result.duplicates > 0 && !bannerDismissed

  return (
    <div className="p-6 space-y-6 max-w-xl">
      {showDuplicateBanner && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">
            Wykryto <strong>{result.duplicates}</strong> potencjalnych duplikatów — transakcje o tej samej dacie, kwocie i numerze konta już istnieją w bazie. Możesz je mimo to zatwierdzić lub odrzucić.
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import CSV</h1>
        <Link
          href="/import/history"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <History className="h-4 w-4" /> Historia transakcji
        </Link>
      </div>

      <div className="space-y-2">
        <Label htmlFor="csv-file">Plik CSV z wyciągiem bankowym</Label>
        <input
          id="csv-file"
          type="file"
          accept=".csv"
          onChange={handleFile}
          disabled={pending}
          className="block text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-input file:bg-background file:text-sm file:cursor-pointer"
        />
      </div>

      {pending && (
        <p className="text-sm text-muted-foreground animate-pulse">Importowanie...</p>
      )}

      {result && (
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <p className="font-medium">Wynik importu</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>Bank: <span className="text-foreground">{result.bank}</span></li>
            <li>Z sugestią najemcy: <span className="text-foreground">{result.withSuggestion}</span></li>
            <li>Bez dopasowania: <span className="text-foreground">{result.withoutSuggestion}</span></li>
            <li>Pominięte (wychodzące / brak danych): <span className="text-muted-foreground">{result.skipped}</span></li>
            {result.duplicates > 0 && (
              <li className="flex items-center gap-1.5">
                <span>Możliwe duplikaty:</span>
                <span className="text-red-600 dark:text-red-400 font-medium">{result.duplicates}</span>
                <span className="relative group">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 cursor-help" />
                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap rounded bg-popover text-popover-foreground text-xs px-2 py-1 shadow-md border border-border">
                    Wykryto {result.duplicates} duplikatów — sprawdź przed zatwierdzeniem
                  </span>
                </span>
              </li>
            )}
          </ul>
          {(result.withSuggestion + result.withoutSuggestion) > 0 && (
            <Link
              href="/import/reconcile"
              className="inline-flex items-center justify-center h-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] border border-border bg-background hover:bg-muted transition-colors"
            >
              Zatwierdź transakcje ({result.withSuggestion + result.withoutSuggestion})
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
