'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getSettlementGroup } from '@/app/(dashboard)/media/actions'
import { tenantDisplayName } from '@/lib/utils'
import { getTimeOffsetMs, setTimeOffsetMs, isTestClockAllowed } from '@/lib/clock'
import { processLateReminders } from '@/lib/late-reminders'
import { processStatementUploadReminder } from '@/lib/statement-reminder'

// Wirtualny zegar (patrz lib/clock.ts) - czas płynie normalnie, tylko
// przesunięty o `time_offset_ms` zapisane w app_config. Poniższe akcje
// pozwalają ustawić/zresetować to przesunięcie z panelu testowego oraz
// ręcznie odpalić crony/automatyzacje pod tym symulowanym czasem.

export async function getTestClockState() {
  if (!isTestClockAllowed()) {
    return { allowed: false, offsetMs: 0 }
  }
  const offsetMs = await getTimeOffsetMs()
  return { allowed: true, offsetMs }
}

// `localDateTime` to wartość z <input type="datetime-local"> (czas lokalny
// przeglądarki, bez strefy), np. "2026-09-16T08:00".
export async function setTestClock(localDateTime: string) {
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
  if (!isTestClockAllowed()) {
    throw new Error('Wirtualny zegar jest wyłączony na tym środowisku')
  }
  await setTimeOffsetMs(0)
}

export async function runLateRemindersTest() {
  if (!isTestClockAllowed()) {
    throw new Error('Niedozwolone na tym środowisku')
  }
  return processLateReminders()
}

export async function runStatementReminderTest() {
  if (!isTestClockAllowed()) {
    throw new Error('Niedozwolone na tym środowisku')
  }
  return processStatementUploadReminder()
}

export async function getGroupDetailsForTest(groupId: number) {
  const supabase = createServiceClient()
  
  const group = await getSettlementGroup(groupId)
  if (!group) return null

  const properties = (group.settlement_group_properties as any[])?.map(p => ({
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
    .filter(t => (t.contracts as any[])?.some(c => c.is_active))
    .map(t => {
      const prop = properties.find(p => p.id === t.property_id)
      return {
        id: t.id,
        name: tenantDisplayName(t as any),
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
// wyjątek sterowany kolumną `app_config.allow_destructive_test_deletes`
// (domyślnie false - trigger blokuje DELETE dokładnie tak jak wcześniej).
// Ta akcja ustawia ją na true tuż przed usuwaniem, ale robi to WYŁĄCZNIE gdy
// `isTestClockAllowed()` zwraca true - czyli nigdy na prawdziwej produkcji.
// Dzięki temu produkcyjna baza ma gwarancję pozostania zablokowana na zawsze
// (nic w kodzie aplikacji nie może tam ustawić tej flagi na true), a dev/
// preview po pierwszym użyciu tego przycisku mają usuwanie trwale odblokowane.
export async function zeroAllTenantBalances() {
  if (!isTestClockAllowed()) {
    throw new Error('Niedozwolone na tym środowisku')
  }

  const supabase = createServiceClient()

  const { error: unlockError } = await supabase
    .from('app_config')
    .update({ allow_destructive_test_deletes: true })
    .eq('id', 1)

  if (unlockError) {
    throw new Error('Nie udało się odblokować usuwania w tym środowisku: ' + unlockError.message)
  }

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

export async function generateTestMediaCharge(
  groupId: number,
  tenantAmounts: Record<string, number>,
  month: number,
  year: number
) {
  const supabase = createServiceClient()

  // Pobierz grupę i powiązane nieruchomości
  const group = await getSettlementGroup(groupId)
  if (!group) throw new Error('Nie znaleziono grupy')

  const propertyIds = (group.settlement_group_properties as any[])?.map(p => p.property_id) || []
  
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
    const activeContract = (tenant.contracts as any[])?.find(c => c.is_active)

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
      },
      { ignoreDuplicates: false }
    )
    
    if (error) {
      console.error('Błąd dodawania testowej noty dla najemca ' + tenant.id, error)
      throw new Error('Błąd podczas zapisywania w bazie dla najemcy ' + tenantDisplayName(tenant as any))
    }
    
    generatedCount++
  }

  if (generatedCount === 0) {
    throw new Error('Żaden ze wskazanych najemców nie ma aktualnie aktywnej umowy.')
  }

  return { success: true, count: generatedCount }
}
