'use client'

import { SkillRunner } from '@/components/skill-runner'

export default function AutomatyzacjePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Automatyzacje</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Skrypty Claude Code uruchamiane na serwerze VPS w tle. Możesz uruchomić kilka jednocześnie
          i śledzić ich postęp. Wymaga skonfigurowanego{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">SKILL_RUNNER_URL</code> i{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">SKILL_RUNNER_TOKEN</code>.
        </p>
      </div>

      <SkillRunner />
    </div>
  )
}
