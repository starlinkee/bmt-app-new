import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ensureMonthlyTasks, getMonthlyTasks } from '@/lib/tasks'
import { createServiceClient } from '@/lib/supabase/service'
import { TaskList } from './task-list'

export default async function DashboardPage() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  await ensureMonthlyTasks(month, year)

  const supabase = createServiceClient()

  const [tasks, { count: activeContracts }, { data: rentInvoices }] =
    await Promise.all([
      getMonthlyTasks(month, year),
      supabase
        .from('contracts')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('invoices')
        .select('amount')
        .eq('type', 'RENT')
        .eq('month', month)
        .eq('year', year),
    ])

  const rentSum = (rentInvoices ?? []).reduce((acc, i) => acc + Number(i.amount), 0)
  const rentCount = rentInvoices?.length ?? 0

  const taskItems = tasks.map((t) => ({
    label: t.type === 'RENT' ? 'Wystawienie czynszów' : 'Rozliczenie mediów',
    status: t.status as 'TODO' | 'DONE',
    href: t.type === 'RENT' ? '/finance' : '/media',
  }))

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Strona główna</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Aktywne umowy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeContracts ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Czynsze {month}/{year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{rentCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Suma czynszów
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {rentSum.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Zadania na {month}/{year}</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskList items={taskItems} />
        </CardContent>
      </Card>
    </div>
  )
}
