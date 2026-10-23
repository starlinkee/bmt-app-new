import { describe, test, expect } from 'vitest'
import { isLegacyPath, rewriteDriveIds } from '../../scripts/storage-copy-to-owner.mjs'

const O = '11111111-1111-4111-8111-111111111111'

describe('scripts/storage-copy-to-owner', () => {
  test('isLegacyPath: stare tak; już z uuid i ai-files/ w invoices nie', () => {
    expect(isLegacyPath('invoices', 'PREVIEW/2026/1/g/n.pdf')).toBe(true)
    expect(isLegacyPath('invoices', 'emails/u_f.pdf')).toBe(true)
    expect(isLegacyPath('invoices', 'preview/emails/u_f.pdf')).toBe(true)
    expect(isLegacyPath('invoices', `${O}/PREVIEW/n.pdf`)).toBe(false)
    expect(isLegacyPath('invoices', 'ai-files/skill/job/x.pdf')).toBe(false)
    expect(isLegacyPath('manual-uploads', 'ai-files/x/y.pdf')).toBe(true)
    expect(isLegacyPath('manual-uploads', 'lokal/2026-01-01_10-00-00/a.pdf')).toBe(true)
  })

  test('rewriteDriveIds: tylko skopiowane ścieżki; id z Drive i prefiksowane bez zmian; idempotentne', () => {
    const copied = new Set(['PREVIEW/2026/1/g/n.pdf'])
    const input = [
      { name: 'a', id: 'PREVIEW/2026/1/g/n.pdf' },
      { name: 'b', id: '1AbCdriveFileId' },
      { name: 'c', id: `${O}/PREVIEW/2026/1/g/n.pdf` },
    ]
    const first = rewriteDriveIds(input, O, copied)
    expect(first.changed).toBe(1)
    expect(first.value.map((e: { id: string }) => e.id)).toEqual([`${O}/PREVIEW/2026/1/g/n.pdf`, '1AbCdriveFileId', `${O}/PREVIEW/2026/1/g/n.pdf`])
    expect(rewriteDriveIds(first.value, O, copied).changed).toBe(0)
    expect(rewriteDriveIds(null, O, copied)).toEqual({ value: null, changed: 0 })
  })
})
