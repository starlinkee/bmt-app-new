// Zabezpieczenie przed odpaleniem testów piszących do bazy na produkcji.
//
// Testy integracyjne (i sprzątanie e2e) używają service_role, więc pomyłka w
// NEXT_PUBLIC_SUPABASE_URL oznaczałaby zapis/kasowanie na prawdziwych danych.
// Numery projektów produkcyjnych (ref = pierwszy człon hosta
// `<ref>.supabase.co`) podajemy jawnie w PRODUCTION_SUPABASE_REFS
// (lista po przecinku) - tam, gdzie gwarancja ma być twarda
// (`requireConfigured`), brak tej zmiennej też kończy się odmową.

export function supabaseRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return host.endsWith('.supabase.co') ? host.split('.')[0] : host
  } catch {
    return null
  }
}

export function getProductionRefs(): string[] {
  return (process.env.PRODUCTION_SUPABASE_REFS ?? '')
    .split(/[\s,]+/)
    .map((s) => supabaseRefFromUrl(s.includes('://') ? s : `https://${s}.supabase.co`))
    .filter((s): s is string => !!s && s !== '.supabase.co')
}

export function assertNotProduction(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  { requireConfigured = false }: { requireConfigured?: boolean } = {},
) {
  if (!url) throw new Error('Brak NEXT_PUBLIC_SUPABASE_URL - nie wiadomo, na jaką bazę celują testy.')

  const refs = getProductionRefs()
  if (requireConfigured && refs.length === 0) {
    throw new Error(
      'Brak PRODUCTION_SUPABASE_REFS (ref projektu/projektów produkcyjnych, lista po przecinku) w .env.e2e - ' +
        'testy integracyjne odmawiają startu bez tej zmiennej, żeby nie móc trafić w produkcję.',
    )
  }

  const ref = supabaseRefFromUrl(url)
  if (ref && refs.includes(ref)) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL (${ref}) to projekt PRODUKCYJNY - testy odmawiają uruchomienia.`)
  }
}
