'use server'

import { createServiceClient } from '@/lib/supabase/service'

export async function getTenantReadingsContext(token: string) {
  const supabase = createServiceClient()
  
  // Znajdź najemcę po tokenie
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, first_name, last_name, properties(id, name)')
    // @ts-expect-error type inference is wrong here
    .eq('reading_token', token)
    .single()
    
  if (tenantErr || !tenant) return null
  
  const propertyId = tenant.properties ? (tenant.properties as { id: number }).id : null
  if (!propertyId) return null

  // Znajdź grupy rozliczeniowe, do których należy ta nieruchomość
  const { data: sgp } = await supabase
    .from('settlement_group_properties')
    .select('settlement_group_id')
    .eq('property_id', propertyId)

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
    groups: groups.filter(g => Array.isArray(g.tenant_reading_keys) && g.tenant_reading_keys.length > 0)
  }
}

export async function getTargetMonthYear() {
  const now = new Date()
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
