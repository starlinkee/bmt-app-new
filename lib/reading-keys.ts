export type TenantReadingEntry = { key: string; label: string }

// Wpis w tenant_reading_keys[tenantId]: stary format to string (sam klucz),
// obecny to { key, label }. Brak / nie-tablica / wpisy bez klucza -> pomijane.
export function normalizeReadingEntries(raw: unknown): TenantReadingEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: TenantReadingEntry[] = []
  for (const e of raw) {
    if (typeof e === 'string') {
      entries.push({ key: e, label: e.replace(/_/g, ' ') })
    } else if (e && typeof e === 'object' && typeof (e as { key?: unknown }).key === 'string') {
      const { key, label } = e as { key: string; label?: unknown }
      entries.push({ key, label: typeof label === 'string' && label ? label : key.replace(/_/g, ' ') })
    }
  }
  return entries
}

export function readingKeysOf(raw: unknown): string[] {
  return normalizeReadingEntries(raw).map((e) => e.key)
}
