import { createServiceClient } from '@/lib/supabase/service'

// Wirtualny zegar do testowania automatyzacji (crony, przypomnienia).
//
// Zasada: przechowujemy w bazie (app_config.time_offset_ms) przesunięcie
// w milisekundach. Efektywny "teraz" to zawsze `Date.now() + offset` - czas
// płynie normalnie, tylko przesunięty. Dzięki temu np. cron sprawdzający
// "czy dziś jest 16. dzień miesiąca, godzina 8:00" da się przetestować bez
// czekania na prawdziwy 16. dzień - a jednocześnie zegar dalej "tyka" zamiast
// być zamrożony na jednej sztywnej dacie.
//
// Dostępne tylko poza produkcją (albo gdy jawnie odblokowano panel testowy) -
// na produkcji offset zawsze traktujemy jako 0, niezależnie od tego, co jest
// w bazie, żeby ewentualny błąd w panelu testowym nigdy nie przesunął
// prawdziwych dat faktur/mailingów.
export function isTestClockAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ALLOW_TEST_PANEL === 'true'
}

export async function getTimeOffsetMs(): Promise<number> {
  if (!isTestClockAllowed()) return 0

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_config')
    .select('time_offset_ms')
    .eq('id', 1)
    .single()

  return data?.time_offset_ms ? Number(data.time_offset_ms) : 0
}

// Zwraca aktualny (ewentualnie symulowany) czas serwera. Ma to być jedyne
// miejsce, przez które kod cronów/automatyzacji pyta o "teraz" - żeby
// symulacja działała spójnie wszędzie.
export async function getCurrentDate(): Promise<Date> {
  const offset = await getTimeOffsetMs()
  return offset ? new Date(Date.now() + offset) : new Date()
}

export async function setTimeOffsetMs(offsetMs: number): Promise<void> {
  if (!isTestClockAllowed()) {
    throw new Error('Wirtualny zegar jest wyłączony na tym środowisku')
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('app_config')
    .update({ time_offset_ms: Math.round(offsetMs) })
    .eq('id', 1)

  if (error) throw error
}
