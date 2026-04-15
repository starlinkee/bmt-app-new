import { createServiceClient } from '@/lib/supabase/service'
import type { MonthlyTaskType, MonthlyTaskStatus } from '@/types/app'

export async function ensureMonthlyTasks(month: number, year: number) {
  const supabase = createServiceClient()
  const types: MonthlyTaskType[] = ['RENT', 'MEDIA']

  await Promise.all(
    types.map((type) =>
      supabase
        .from('monthly_tasks')
        .upsert({ type, month, year, status: 'TODO' }, { onConflict: 'type,month,year', ignoreDuplicates: true })
    ),
  )
}

export async function markMonthlyTaskDone(type: MonthlyTaskType, month: number, year: number) {
  const supabase = createServiceClient()
  await supabase
    .from('monthly_tasks')
    .update({ status: 'DONE', completed_at: new Date().toISOString() })
    .eq('type', type)
    .eq('month', month)
    .eq('year', year)
}

export async function getMonthlyTasks(month: number, year: number) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('monthly_tasks')
    .select('*')
    .eq('month', month)
    .eq('year', year)
  return data ?? []
}
