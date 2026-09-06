import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const browse = req.nextUrl.searchParams.get('browse')
  const filePath = req.nextUrl.searchParams.get('path') // e.g. "skillName/jobId/fileName"
  const jobId = req.nextUrl.searchParams.get('jobId')
  const fileName = req.nextUrl.searchParams.get('file')

  const supabase = createServiceClient()

  try {
    // Browse all skill output folders
    if (browse === '1') {
      // List skills
      const { data: skillFolders, error: err1 } = await supabase.storage.from('invoices').list('ai-files')
      if (err1) throw err1
      
      const skills = []
      
      for (const sf of skillFolders || []) {
        if (!sf.id) continue; // skip files if any
        const { data: runFolders } = await supabase.storage.from('invoices').list(`ai-files/${sf.name}`)
        const runs = []
        
        for (const rf of runFolders || []) {
          if (!rf.id) continue;
          const { data: filesData } = await supabase.storage.from('invoices').list(`ai-files/${sf.name}/${rf.name}`)
          const files = (filesData || []).filter(f => !f.id).map(f => ({
            name: f.name,
            size: f.metadata?.size || 0,
            ext: '.' + f.name.split('.').pop()?.toLowerCase(),
          }))
          
          runs.push({
            name: rf.name,
            createdMs: new Date(rf.created_at || Date.now()).getTime(),
            files
          })
        }
        
        runs.sort((a, b) => b.createdMs - a.createdMs)
        skills.push({ name: sf.name, runs })
      }
      
      return NextResponse.json({ skills })
    }

    // Serve a file by relative path
    if (filePath) {
      const { data, error } = await supabase.storage.from('invoices').createSignedUrl(`ai-files/${filePath}`, 60, { download: true })
      if (error || !data) return NextResponse.json({ error: 'File not found' }, { status: 404 })
      return NextResponse.redirect(data.signedUrl)
    }

    // Legacy: per-job file listing / download
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    if (fileName) {
      // We don't know the exact skill from jobId alone here if it wasn't passed, but wait!
      // Skill runner component doesn't pass skillName to download!
      // Let's search all skills to find the jobId.
      const { data: skillFolders } = await supabase.storage.from('invoices').list('ai-files')
      let foundPath = null
      
      for (const sf of skillFolders || []) {
        if (!sf.id) continue
        // We assume the jobId is a folder inside the skill
        const { data: runFolders } = await supabase.storage.from('invoices').list(`ai-files/${sf.name}`, { search: jobId })
        if (runFolders && runFolders.find(r => r.name === jobId)) {
          foundPath = `ai-files/${sf.name}/${jobId}/${fileName}`
          break
        }
      }
      
      if (!foundPath) return NextResponse.json({ error: 'File not found' }, { status: 404 })
      
      const { data, error } = await supabase.storage.from('invoices').createSignedUrl(foundPath, 60, { download: true })
      if (error || !data) return NextResponse.json({ error: 'File not found' }, { status: 404 })
      return NextResponse.redirect(data.signedUrl)
    }

    // List files for a specific jobId
    const { data: skillFolders } = await supabase.storage.from('invoices').list('ai-files')
    let foundSkill = null
    
    for (const sf of skillFolders || []) {
      if (!sf.id) continue
      const { data: runFolders } = await supabase.storage.from('invoices').list(`ai-files/${sf.name}`, { search: jobId })
      if (runFolders && runFolders.find(r => r.name === jobId)) {
        foundSkill = sf.name
        break
      }
    }
    
    if (!foundSkill) return NextResponse.json({ files: [], folder: null })
    
    const { data: filesData } = await supabase.storage.from('invoices').list(`ai-files/${foundSkill}/${jobId}`)
    const files = (filesData || []).filter(f => !f.id).map(f => ({
      name: f.name,
      size: f.metadata?.size || 0,
      ext: '.' + f.name.split('.').pop()?.toLowerCase(),
    }))
    
    return NextResponse.json({ files, folder: jobId })
    
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not fetch files: ${message}` }, { status: 502 })
  }
}
