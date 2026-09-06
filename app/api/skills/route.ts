import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()
  
  try {
    const { data, error } = await supabase
      .from('skill_prompts')
      .select('id, label, description, timeout_ms')
      .order('id')
      
    if (error) throw error
    
    // Map to expected frontend format
    const skills = data.map(s => ({
      id: s.id,
      label: s.label,
      description: s.description,
      timeoutMs: s.timeout_ms
    }))
    
    return NextResponse.json({ skills })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: \Could not fetch skills: \\ }, { status: 502 })
  }
}
