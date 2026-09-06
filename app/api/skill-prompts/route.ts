import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

function isValidSkillId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && id.length <= 60
}

export async function GET(req: NextRequest) {
  const skillId = req.nextUrl.searchParams.get('skillId')
  if (!isValidSkillId(skillId)) {
    return NextResponse.json({ error: 'Invalid skillId' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    const { data, error } = await (supabase as any)
      .from('skill_prompts')
      .select('prompt')
      .eq('id', skillId)
      .single()
      
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
      }
      throw error
    }
    
    return NextResponse.json({ content: data.prompt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not fetch prompt: ${message}` }, { status: 502 })
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { skillId, content, label, description, timeoutMs } = body

  if (!isValidSkillId(skillId)) {
    return NextResponse.json({ error: 'Invalid skillId' }, { status: 400 })
  }
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    const { error } = await (supabase as any)
      .from('skill_prompts')
      .upsert({
        id: skillId,
        prompt: content,
        label: label || skillId,
        description: description || '',
        timeout_ms: timeoutMs || 300000,
        updated_at: new Date().toISOString()
      })
      
    if (error) throw error
    
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not save prompt: ${message}` }, { status: 502 })
  }
}

export async function DELETE(req: NextRequest) {
  const skillId = req.nextUrl.searchParams.get('skillId')
  if (!isValidSkillId(skillId)) {
    return NextResponse.json({ error: 'Invalid skillId' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    const { error } = await (supabase as any)
      .from('skill_prompts')
      .delete()
      .eq('id', skillId)
      
    if (error) throw error
    
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not delete skill: ${message}` }, { status: 502 })
  }
}
