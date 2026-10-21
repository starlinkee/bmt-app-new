import { afterAll, describe, expect, test } from 'vitest'
import { createTestDbClient, loose, purgeAllTestData } from '../../tests-support/db'
import { uniq } from '../../tests-support/factories'

// Slice 4b: current_owner_id() = auth.uid(), więc rola service bez jawnego owner_id nie ma dokąd zapisać.
// `raw: true` = czysty klient service (bez symulacji sesji z setup.ts).
const db = createTestDbClient({ raw: true })
const ldb = loose(db)

afterAll(async () => {
  await purgeAllTestData(createTestDbClient({ raw: true }))
})

const row = () => ({ name: `E2E_TEST__owner_default_${uniq()}`, address1: 'ul. Testowa 1', type: 'Mieszkanie' })

describe('owner_id bez fallbacku legacy', () => {
  test('insert service rolą bez owner_id -> NOT NULL (23502)', async () => {
    const { error } = await ldb.from('properties').insert(row())
    expect(error?.code).toBe('23502')
    expect(error?.message).toContain('owner_id')
  })

  test('insert z jawnym owner_id -> OK', async () => {
    const { data: legacy } = await ldb.from('legacy_owner').select('owner_id').eq('id', 1).single()
    const { error } = await ldb.from('properties').insert({ ...row(), owner_id: legacy!.owner_id })
    expect(error).toBeNull()
  })
})
