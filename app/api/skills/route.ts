import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('skill_prompts')
      .select('id, label, description, timeout_ms, settlement_group_id')
      .order('id')

    if (error) throw error

    // Map to expected frontend format
    type SkillPromptRow = { id: string, label: string, description: string, timeout_ms: number, settlement_group_id: number | null }
    const skills = (data as SkillPromptRow[]).map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      timeoutMs: s.timeout_ms,
      groupId: s.settlement_group_id
    }))
    
    return NextResponse.json({ skills })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not fetch skills: ${message}` }, { status: 502 })
  }
}
