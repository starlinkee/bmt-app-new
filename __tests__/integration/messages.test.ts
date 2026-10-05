import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createTestDbClient, E2E_PREFIX, purgeAllTestData } from '../../tests-support/db'
import { createEmailLog, uniq } from '../../tests-support/factories'
import { getEmailLogs } from '@/app/(dashboard)/wiadomosci/actions'

const db = createTestDbClient()

// Unikalny znacznik - wszystkie adresy tego przebiegu zawierają go, więc filtr po
// odbiorcy zawęża wynik do naszych wierszy, nawet gdy w bazie są prawdziwe logi.
const tag = uniq()
const address = (who: string) => `${E2E_PREFIX.toLowerCase()}${who}_${tag}@example.invalid`

// Daty w 2001 r. - daleko od jakichkolwiek prawdziwych wpisów w logach.
const ROWS = {
  juneEarly: { to: address('anna'), sentAt: '2001-06-01T00:00:00Z' },
  juneLate: { to: address('bob'), sentAt: '2001-06-30T23:30:00Z' },
  july: { to: address('anna2'), sentAt: '2001-07-01T08:00:00Z' },
}
const ids: Record<keyof typeof ROWS, number> = { juneEarly: 0, juneLate: 0, july: 0 }

beforeAll(async () => {
  for (const key of Object.keys(ROWS) as (keyof typeof ROWS)[]) {
    ids[key] = (await createEmailLog(db, { ...ROWS[key], subject: `${E2E_PREFIX}${key}` })).id
  }
})

afterAll(async () => {
  await purgeAllTestData(db)
})

const idsOf = async (params: Parameters<typeof getEmailLogs>[0]) =>
  (await getEmailLogs({ recipient: tag, ...params })).map((r) => r.id)

describe('getEmailLogs', () => {
  test('bez filtra dat zwraca wiersze od najnowszego', async () => {
    expect(await idsOf({})).toEqual([ids.july, ids.juneLate, ids.juneEarly])
  })

  test('zakres dat obejmuje oba krańcowe dni (dateTo do końca dnia)', async () => {
    expect(await idsOf({ dateFrom: '2001-06-01', dateTo: '2001-06-30' })).toEqual([ids.juneLate, ids.juneEarly])
  })

  test('dateFrom odcina wcześniejsze, a dateTo późniejsze wiersze', async () => {
    expect(await idsOf({ dateFrom: '2001-06-15' })).toEqual([ids.july, ids.juneLate])
    expect(await idsOf({ dateTo: '2001-06-15' })).toEqual([ids.juneEarly])
  })

  test('filtr odbiorcy szuka fragmentu adresu bez względu na wielkość liter', async () => {
    const byName = async (fragment: string) =>
      (await getEmailLogs({ recipient: fragment.toUpperCase() })).map((r) => r.id)

    expect(await byName(`${E2E_PREFIX}anna_${tag}`)).toEqual([ids.juneEarly])
    expect(await byName(`${E2E_PREFIX}anna2_${tag}`)).toEqual([ids.july])
    expect(await byName(`${E2E_PREFIX}bob_${tag}`)).toEqual([ids.juneLate])
  })

  test('filtry dat i odbiorcy łączą się (AND)', async () => {
    expect(await idsOf({ dateFrom: '2001-07-01' })).toEqual([ids.july])
    expect(await getEmailLogs({ recipient: address('bob'), dateFrom: '2001-07-01' })).toEqual([])
  })

  test('zwraca pełne wiersze: temat, treść, załączniki', async () => {
    const attachments = [{ name: 'Nota.pdf', path: 'abc_Nota.pdf' }]
    const withAttachment = await createEmailLog(db, {
      to: address('zalacznik'),
      subject: `${E2E_PREFIX}z zalacznikiem`,
      body: '<p>Dzień dobry</p>',
      sentAt: '2001-08-01T10:00:00Z',
      attachments,
    })

    const [row] = await getEmailLogs({ recipient: address('zalacznik') })

    expect(row).toMatchObject({
      id: withAttachment.id,
      subject: `${E2E_PREFIX}z zalacznikiem`,
      body: '<p>Dzień dobry</p>',
      attachments,
    })
  })

  test('brak pasujących wierszy -> pusta lista', async () => {
    expect(await getEmailLogs({ recipient: `${E2E_PREFIX}nikt_${uniq()}` })).toEqual([])
  })
})
