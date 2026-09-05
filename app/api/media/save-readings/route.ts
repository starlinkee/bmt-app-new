import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { group_id, month, year, readings } = body

    if (!group_id || !month || !year || !Array.isArray(readings)) {
      return NextResponse.json({ error: 'Nieprawidłowe dane wejściowe' }, { status: 400 })
    }

    const supabase = createServiceClient()
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
  } catch (err) {
    return NextResponse.json({ error: 'Nieoczekiwany błąd' }, { status: 500 })
  }
}
