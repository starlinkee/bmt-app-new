import { describe, test, expect } from 'vitest'
import {
  INCOME_TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_STATUS_VARIANTS,
} from '@/lib/transactionStatus'

describe('transactionStatus', () => {
  test('INCOME_TRANSACTION_STATUSES to dokładnie MATCHED i MANUAL (whitelista)', () => {
    expect([...INCOME_TRANSACTION_STATUSES].sort()).toEqual(['MANUAL', 'MATCHED'])
  })

  test.each(['REJECTED_OWN_TRANSFER', 'REJECTED_DUPLICATE', 'REJECTED_OTHER', 'UNMATCHED', 'SKIPPED', 'PENDING'])(
    'status %s nie jest wpływem od najemcy',
    (status) => {
      expect(INCOME_TRANSACTION_STATUSES).not.toContain(status)
    },
  )

  test('każdy status ma etykietę i wariant odznaki', () => {
    const labelKeys = Object.keys(TRANSACTION_STATUS_LABELS).sort()
    expect(Object.keys(TRANSACTION_STATUS_VARIANTS).sort()).toEqual(labelKeys)
    for (const status of INCOME_TRANSACTION_STATUSES) {
      expect(TRANSACTION_STATUS_LABELS[status]).toBeTruthy()
    }
    for (const label of Object.values(TRANSACTION_STATUS_LABELS)) {
      expect(label.length).toBeGreaterThan(0)
    }
  })
})
