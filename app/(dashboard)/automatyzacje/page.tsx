'use client'

import { useState } from 'react'
import { SkillRunner } from '@/components/skill-runner'
import { VpsFileBrowser } from '@/components/vps-file-browser'

type View = 'tasks' | 'files'

export default function AutomatyzacjePage() {
  const [view, setView] = useState<View>('tasks')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ściągnij faktury z AI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Skrypty Claude Code uruchamiane na serwerze VPS w tle. Wymaga skonfigurowanego{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">SKILL_RUNNER_URL</code> i{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">SKILL_RUNNER_TOKEN</code>.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setView('tasks')}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            view === 'tasks'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          Zadania
        </button>
        <button
          onClick={() => setView('files')}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            view === 'files'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          Pliki VPS
        </button>
      </div>

      {view === 'tasks' ? <SkillRunner /> : <VpsFileBrowser />}
    </div>
  )
}
