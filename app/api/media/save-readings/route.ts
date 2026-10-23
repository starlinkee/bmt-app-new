import { NextResponse } from 'next/server'
import { getApiUserClient } from '@/lib/auth-guard'

export async function POST(req: Request) {
  const ctx = await getApiUserClient()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { group_id, month, year, readings } = body

    if (!group_id || !month || !year || !Array.isArray(readings)) {
      return NextResponse.json({ error: 'Nieprawidłowe dane wejściowe' }, { status: 400 })
    }

    const supabase = ctx.supabase

    // RLS pilnuje owner_id wiersza, ale nie tego, do czyjej grupy wskazuje group_id.
    const { data: group } = await supabase.from('settlement_groups').select('id').eq('id', group_id).maybeSingle()
    if (!group) return NextResponse.json({ error: 'Nie znaleziono grupy' }, { status: 404 })

    const rowsToInsert = readings.map((r: { key: string; value: number }) => ({
      group_id,
      month,
      year,
      key: r.key,
      value: r.value,
    }))

    const { error } = await supabase
      .from('media_meter_readings')
      .upsert(rowsToInsert, { onConflict: 'group_id,month,year,key' })

    if (error) {
      console.error('Błąd zapisu odczytów:', error)
      return NextResponse.json({ error: 'Błąd bazy danych' }, { status: 500 })
    }

    return NextResponse.json({ success: true, inserted: rowsToInsert.length })
  } catch {
    return NextResponse.json({ error: 'Nieoczekiwany błąd' }, { status: 500 })
  }
}
