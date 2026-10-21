import { listOwnerIds } from '@/lib/app-config'

export type OwnerRunResult<T> = ({ ownerId: string; ok: true } & T) | { ownerId: string; ok: false; error: string }

/**
 * Uruchamia job crona osobno dla każdego konta. Błąd jednego konta nie przerywa pozostałych -
 * trafia do wyniku tego konta. Wynik nie powinien zawierać danych osobowych (nazw, e-maili).
 */
export async function runForEachOwner<T extends object>(job: (ownerId: string) => Promise<T>): Promise<OwnerRunResult<T>[]> {
  const results: OwnerRunResult<T>[] = []
  for (const ownerId of await listOwnerIds()) {
    try {
      results.push({ ownerId, ok: true, ...(await job(ownerId)) })
    } catch (error) {
      console.error('Błąd crona dla konta', ownerId, error)
      results.push({ ownerId, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}

/** Cron kończy się błędem HTTP tylko wtedy, gdy nie powiódł się żaden z (niepustej listy) kont. */
export function allOwnersFailed(results: { ok: boolean }[]): boolean {
  return results.length > 0 && results.every((r) => !r.ok)
}
