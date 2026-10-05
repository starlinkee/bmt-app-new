import Link from 'next/link'
import { isBackfillEnabled } from './actions'
import { BackfillForm } from './backfill-form'

export default async function BackfillRentsPage() {
  // Zakładka jest ukrywana w menu, ale pilnujemy też bezpośredniego wejścia
  // po URL-u, gdy opcja jest wyłączona w Ustawieniach.
  if (!(await isBackfillEnabled())) {
    return (
      <div className="p-6 space-y-2 max-w-xl">
        <h1 className="text-2xl font-semibold">Rozlicz w przeszłości</h1>
        <p className="text-sm text-muted-foreground">
          Ta zakładka jest wyłączona. Możesz ją włączyć w{' '}
          <Link href="/ustawienia" className="underline">Ustawieniach</Link>.
        </p>
      </div>
    )
  }

  return <BackfillForm />
}
