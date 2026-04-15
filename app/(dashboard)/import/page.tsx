'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { importCsvTransactions } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function ImportPage() {
  const [result, setResult] = useState<{
    bank: string
    total: number
    matched: number
    unmatched: number
    skipped: number
  } | null>(null)
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
        toast.success('Import zakończony.')
      })
    }
    reader.readAsText(file, 'UTF-8')
    // Reset input
    e.target.value = ''
  }

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Import CSV</h1>

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
            <li>Łącznie: <span className="text-foreground">{result.total}</span></li>
            <li>Dopasowane: <span className="text-green-600">{result.matched}</span></li>
            <li>Niedopasowane: <span className="text-destructive">{result.unmatched}</span></li>
            <li>Pominięte: <span className="text-foreground">{result.skipped}</span></li>
          </ul>
          {result.unmatched > 0 && (
            <Link
              href="/import/reconcile"
              className="inline-flex items-center justify-center h-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] border border-border bg-background hover:bg-muted transition-colors"
            >
              Przypisz transakcje ({result.unmatched})
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
