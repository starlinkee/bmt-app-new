'use server'

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'

export async function getTenantReadingsContext(token: string) {
  const supabase = createServiceClient()
  
  // Znajdź najemcę po tokenie i pobierz jego aktywne umowy z włączonymi mediami
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, first_name, last_name, property_id, contracts(is_active, has_media_invoice)')
    // @ts-expect-error type inference is wrong here
    .eq('reading_token', token)
    .single()
    
  if (tenantErr || !tenant) return null
  
  const activeMediaContracts = (tenant.contracts as unknown as { is_active: boolean; has_media_invoice: boolean }[] | undefined)
    ?.filter(c => c.is_active && c.has_media_invoice) || []
    
  if (activeMediaContracts.length === 0) return null
  
  const propertyIds = tenant.property_id ? [tenant.property_id] : []
  if (propertyIds.length === 0) return null

  // Znajdź grupy rozliczeniowe, do których należą te nieruchomości
  const { data: sgp } = await supabase
    .from('settlement_group_properties')
    .select('settlement_group_id')
    .in('property_id', propertyIds)

  if (!sgp || sgp.length === 0) return null
  
  const groupIds = sgp.map(s => s.settlement_group_id)
  
  const { data: groups } = await supabase
    .from('settlement_groups')
    .select('id, name, tenant_reading_keys')
    .in('id', groupIds)
    
  if (!groups || groups.length === 0) return null

  return {
    tenant: {
      id: tenant.id,
      name: `${tenant.first_name} ${tenant.last_name}`,
    },
    groups: groups.filter(g => {
      if (!g.tenant_reading_keys || typeof g.tenant_reading_keys !== 'object' || Array.isArray(g.tenant_reading_keys)) return false;
      const trk = g.tenant_reading_keys as Record<string, string[]>;
      const keys = trk[tenant.id.toString()];
      return Array.isArray(keys) && keys.length > 0;
    })
  }
}

export async function getTargetMonthYear() {
  const cookieStore = await cookies()
  const isOverrideAllowed = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ALLOW_TEST_PANEL === 'true'
  const testDate = isOverrideAllowed ? cookieStore.get('bmt_test_date')?.value : null
  const now = testDate ? new Date(testDate) : new Date()
  
  const day = now.getDate()
  let month = now.getMonth() + 1
  let year = now.getFullYear()
  
  // Do 15-tego podajemy za poprzedni miesiąc.
  // Od 16-tego podajemy za obecny miesiąc.
  if (day <= 15) {
    month -= 1
    if (month === 0) {
      month = 12
      year -= 1
    }
  }
  
  return { month, year }
}

export async function hasAlreadySubmitted(groupId: number, month: number, year: number, keys: string[]) {
  if (!keys || keys.length === 0) return false
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('media_meter_readings')
    .select('id')
    .eq('group_id', groupId)
    .eq('month', month)
    .eq('year', year)
    .in('key', keys)
    .limit(1)
    
  return !!(data && data.length > 0)
}

export async function saveReadings(groupId: number, month: number, year: number, readings: Record<string, string>) {
  const supabase = createServiceClient()
  
  const rows = Object.entries(readings).map(([key, val]) => ({
    group_id: groupId,
    month,
    year,
    key,
    value: parseFloat(val.replace(',', '.'))
  }))
  
  const { error } = await supabase
    .from('media_meter_readings')
    .upsert(rows, { onConflict: 'group_id,month,year,key' })
    
  if (error) throw error
  return { success: true }
}
