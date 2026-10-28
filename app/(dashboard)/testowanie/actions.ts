'use server'

import { getSettlementGroup } from '@/app/(dashboard)/media/actions'
import { tenantDisplayName } from '@/lib/utils'
import { getTimeOffsetMs, setTimeOffsetMs, isTestClockAllowed } from '@/lib/clock'
import { processLateReminders } from '@/lib/late-reminders'
import { processStatementUploadReminder } from '@/lib/statement-reminder'
import { getUserClient } from '@/lib/auth-guard'
import { updateSystemSettings } from '@/lib/app-config'

// Wirtualny zegar (patrz lib/clock.ts) - czas płynie normalnie, tylko
// przesunięty o `time_offset_ms` zapisane w system_settings. Poniższe akcje
// pozwalają ustawić/zresetować to przesunięcie z panelu testowego oraz
// ręcznie odpalić crony/automatyzacje pod tym symulowanym czasem.

// Panel testowy: poza zalogowanym użytkownikiem wymagamy też, żeby był włączony
// na tym środowisku (ta sama reguła co pozycja w menu - lib/clock.ts).
async function guardTestPanel() {
  const ctx = await getUserClient()
  if (!isTestClockAllowed()) throw new Error('Test panel disabled')
  return ctx
}

// Odblokowanie triggera prevent_delete_function (flaga w system_settings) - jedyny kanał
// zapisu system_settings to lib/app-config. Wołać tylko po guardTestPanel + isTestClockAllowed.
async function unlockDestructiveDeletes() {
  try {
    await updateSystemSettings({ allow_destructive_test_deletes: true })
  } catch (e) {
    throw new Error('Nie udało się odblokować usuwania w tym środowisku: ' + (e instanceof Error ? e.message : String(e)))
  }
}

export async function getTestClockState() {
  await guardTestPanel()
  const offsetMs = await getTimeOffsetMs()
  return { allowed: true, offsetMs }
}

// `localDateTime` to wartość z <input type="datetime-local"> (czas lokalny
// przeglądarki, bez strefy), np. "2026-09-16T08:00".
export async function setTestClock(localDateTime: string) {
  await guardTestPanel()
  if (!isTestClockAllowed()) {
    throw new Error('Wirtualny zegar jest wyłączony na tym środowisku')
  }
  const target = new Date(localDateTime)
  if (isNaN(target.getTime())) {
    throw new Error('Nieprawidłowa data/godzina')
  }
  const offsetMs = target.getTime() - Date.now()
  await setTimeOffsetMs(offsetMs)
  return { offsetMs }
}

export async function resetTestClock() {
  await guardTestPanel()
  if (!isTestClockAllowed()) {
    throw new Error('Wirtualny zegar jest wyłączony na tym środowisku')
  }
  await setTimeOffsetMs(0)
}

export async function runLateRemindersTest() {
  const { user } = await guardTestPanel()
  if (!isTestClockAllowed()) {
    throw new Error('Niedozwolone na tym środowisku')
  }
  return processLateReminders(user.id)
}

export async function runStatementReminderTest() {
  const { user } = await guardTestPanel()
  if (!isTestClockAllowed()) {
    throw new Error('Niedozwolone na tym środowisku')
  }
  return processStatementUploadReminder(user.id)
}

export async function getGroupDetailsForTest(groupId: number) {
  const { supabase } = await guardTestPanel()

  const group = await getSettlementGroup(groupId)
  if (!group) return null

  const properties = (group.settlement_group_properties as { property_id: number, properties?: { name?: string, address1?: string, address2?: string } }[])?.map(p => ({
    id: p.property_id,
    name: p.properties?.name || 'Nieznana nazwa',
    address: [p.properties?.address1, p.properties?.address2].filter(Boolean).join(', ')
  })) || []

  const propertyIds = properties.map(p => p.id)
  
  if (propertyIds.length === 0) {
    return { properties, tenants: [] }
  }

  const { data: tenants } = await supabase
    .from('tenants')
    .select('*, contracts(*)')
    .in('property_id', propertyIds)

  const activeTenants = (tenants || [])
    .filter(t => (t.contracts as { is_active: boolean }[])?.some(c => c.is_active))
    .map(t => {
      const prop = properties.find(p => p.id === t.property_id)
      return {
        id: t.id,
        name: tenantDisplayName(t),
        property_id: t.property_id,
        propertyName: prop?.name || 'Nieznany lokal',
        propertyAddress: prop?.address || ''
      }
    })

  return { properties, tenants: activeTenants }
}

// Kasuje WSZYSTKIE transakcje i faktury przypisane do najemców, sprowadzając
// saldo każdego z nich dokładnie do 0 (0 wpłat - 0 obciążeń).
//
// `transactions`/`invoices` mają trigger blokujący DELETE (patrz
// supabase/migrations/20260908135400_prevent_critical_deletions.sql),
// potwierdzone bezpośrednio na bazie zapytaniem do information_schema.
// Migracja 20260911140000_configurable_delete_protection.sql dodała do niego
// wyjątek sterowany kolumną `system_settings.allow_destructive_test_deletes`
// (domyślnie false - trigger blokuje DELETE dokładnie tak jak wcześniej).
// Ta akcja ustawia ją na true tuż przed usuwaniem, ale robi to WYŁĄCZNIE gdy
// `isTestClockAllowed()` zwraca true - czyli nigdy na prawdziwej produkcji.
// Dzięki temu produkcyjna baza ma gwarancję pozostania zablokowana na zawsze
// (nic w kodzie aplikacji nie może tam ustawić tej flagi na true), a dev/
// preview po pierwszym użyciu tego przycisku mają usuwanie trwale odblokowane.
export async function zeroAllTenantBalances() {
  const { supabase } = await guardTestPanel()
  if (!isTestClockAllowed()) {
    throw new Error('Niedozwolone na tym środowisku')
  }

  await unlockDestructiveDeletes()

  const { error: txError, count: deletedTransactions } = await supabase
    .from('transactions')
    .delete({ count: 'exact' })
    .not('tenant_id', 'is', null)

  if (txError) {
    console.error('Błąd kasowania transakcji najemców', txError)
    throw new Error('Błąd podczas kasowania transakcji: ' + txError.message)
  }

  const { error: invError, count: deletedInvoices } = await supabase
    .from('invoices')
    .delete({ count: 'exact' })
    .not('tenant_id', 'is', null)

  if (invError) {
    console.error('Błąd kasowania faktur najemców', invError)
    throw new Error('Błąd podczas kasowania faktur: ' + invError.message)
  }

  return {
    success: true,
    deletedTransactions: deletedTransactions ?? 0,
    deletedInvoices: deletedInvoices ?? 0,
  }
}

// Kasuje CAŁĄ historię przelewów z `transactions` - w odróżnieniu od
// zeroAllTenantBalances() (która celowo zostawia w spokoju wiersze bez
// tenant_id, np. REJECTED_OWN_TRANSFER/REJECTED_DUPLICATE/REJECTED_OTHER/
// SKIPPED/UNMATCHED - patrz app/(dashboard)/import/actions.ts) ta akcja nie
// filtruje po tenant_id w ogóle, więc czyści też odrzucone transakcje i
// wykryte duplikaty. Ten sam mechanizm odblokowania triggera co wyżej -
// działa wyłącznie gdy isTestClockAllowed() zwraca true, więc nigdy na
// prawdziwej produkcji.
export async function clearAllTransactionHistory() {
  const { supabase } = await guardTestPanel()
  if (!isTestClockAllowed()) {
    throw new Error('Niedozwolone na tym środowisku')
  }

  await unlockDestructiveDeletes()

  const { error: txError, count: deletedTransactions } = await supabase
    .from('transactions')
    .delete({ count: 'exact' })
    .not('id', 'is', null)

  if (txError) {
    console.error('Błąd kasowania historii transakcji', txError)
    throw new Error('Błąd podczas kasowania historii transakcji: ' + txError.message)
  }

  return {
    success: true,
    deletedTransactions: deletedTransactions ?? 0,
  }
}

export async function generateTestMediaCharge(
  groupId: number,
  tenantAmounts: Record<string, number>,
  month: number,
  year: number
) {
  const { supabase } = await guardTestPanel()

  // Pobierz grupę i powiązane nieruchomości
  const group = await getSettlementGroup(groupId)
  if (!group) throw new Error('Nie znaleziono grupy')

  const propertyIds = (group.settlement_group_properties as { property_id: number }[])?.map(p => p.property_id) || []

  if (propertyIds.length === 0) {
    throw new Error('Grupa nie ma przypisanych żadnych nieruchomości (lokali)')
  }

  const validTenantIds = Object.keys(tenantAmounts).map(id => parseInt(id)).filter(id => !isNaN(id))
  if (validTenantIds.length === 0) {
    throw new Error('Nie podano żadnych kwot dla najemców')
  }

  // Upewnijmy się, że jest jakieś rozliczenie (settlement) żeby podpiąć faktury
  let { data: settlement } = await supabase
    .from('media_settlements')
    .select('id')
    .eq('group_id', groupId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle()

  if (!settlement) {
    const { data: newSettlement, error: settlementError } = await supabase
      .from('media_settlements')
      .insert({
        group_id: groupId,
        month,
        year,
        spreadsheet_id: 'TEST_MANUAL',
        drive_pdf_ids: []
      })
      .select('id')
      .single()

    if (settlementError) throw settlementError
    settlement = newSettlement
  }

  // Pobieramy podanych najemców
  const { data: tenants } = await supabase
    .from('tenants')
    .select('*, contracts(*)')
    .in('id', validTenantIds)

  if (!tenants || tenants.length === 0) {
    throw new Error('Nie znaleziono podanych najemców w bazie')
  }

  let generatedCount = 0

  for (const tenant of tenants) {
    const activeContract = (tenant.contracts as { id: number, is_active: boolean }[])?.find(c => c.is_active)

    if (!activeContract) continue

    const amount = tenantAmounts[tenant.id.toString()]
    if (amount === undefined) continue

    // Tworzenie obciążenia w bazie
    const { error } = await supabase.from('invoices').upsert(
      {
        type: 'MEDIA',
        number: null,
        amount,
        month,
        year,
        tenant_id: tenant.id,
        contract_id: activeContract.id,
        media_settlement_id: settlement.id,
        source: 'TEST_MANUAL',
      },
      { ignoreDuplicates: false }
    )
    
    if (error) {
      console.error('Błąd dodawania testowej noty dla najemca ' + tenant.id, error)
      throw new Error('Błąd podczas zapisywania w bazie dla najemcy ' + tenantDisplayName(tenant))
    }
    
    generatedCount++
  }

  if (generatedCount === 0) {
    throw new Error('Żaden ze wskazanych najemców nie ma aktualnie aktywnej umowy.')
  }

  return { success: true, count: generatedCount }
}
