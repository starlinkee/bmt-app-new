import Link from 'next/link'
import { isBackfillEnabled } from '../rozlicz-w-przeszlosci/actions'
import { MediaBackfillForm } from './media-backfill-form'

export default async function MediaBackfillPage() {
  // Zakładka jest ukrywana w menu, ale pilnujemy też bezpośredniego wejścia
  // po URL-u, gdy opcja jest wyłączona w Ustawieniach.
  if (!(await isBackfillEnabled())) {
    return (
      <div className="p-6 space-y-2 max-w-xl">
        <h1 className="text-2xl font-semibold">Media w przeszłości</h1>
        <p className="text-sm text-muted-foreground">
          Ta zakładka jest wyłączona. Możesz ją włączyć w{' '}
          <Link href="/ustawienia" className="underline">Ustawieniach</Link>.
        </p>
      </div>
    )
  }

  return <MediaBackfillForm />
}
