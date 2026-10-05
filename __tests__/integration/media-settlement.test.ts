import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { patchAppConfigForSuite } from '../../tests-support/appConfig'
import { createTestDbClient, E2E_PREFIX, loose, purgeAllTestData } from '../../tests-support/db'
import {
  createContract,
  createProperty,
  createSettlementGroup,
  createTenant,
  testEmail,
} from '../../tests-support/factories'
import { mailbox, storage } from './helpers/runtime'

// Warstwa Google (arkusze + Drive) jest zamockowana - poprawność samego modelu
// obliczeń w arkuszu i wygląd noty są poza zakresem (patrz testing-plan.md, D2).
// Reszta (Supabase, e-mail, PDF-y w Storage) działa jak w aplikacji.
const sheets = vi.hoisted(() => ({
  outputs: {} as Record<string, string>,
  missing: [] as string[],
  written: [] as { sheetId: string; mapping: Record<string, string>; values: Record<string, string | number> }[],
  exports: [] as { sheetId: string; gid?: string }[],
  folders: [] as unknown[][],
  copies: [] as { templateId: string; name: string; folderId: string; shareWith: string }[],
}))

vi.mock('@/lib/sheetsEngine', () => ({
  getServiceAccountEmail: () => 'service-account@test.invalid',
  validateNamedRanges: async (_sheetId: string, ranges: string[]) => ({
    missing: ranges.filter((r) => sheets.missing.includes(r)),
  }),
  writeInputValues: async (sheetId: string, mapping: Record<string, string>, values: Record<string, string | number>) => {
    sheets.written.push({ sheetId, mapping, values })
  },
  readOutputValues: async (_sheetId: string, mapping: Record<string, string>) =>
    Object.fromEntries(Object.keys(mapping).map((range) => [range, sheets.outputs[range] ?? ''])),
  exportSheetAsPdf: async (sheetId: string, gid?: string) => {
    sheets.exports.push({ sheetId, gid })
    return Buffer.from(`%PDF-1.4 fake ${gid ?? 'caly-arkusz'}`)
  },
  getAllSheetGids: async () => ({ Nota: '111', Zestawienie: '222' }),
  stripSpreadsheetColors: async () => undefined,
}))

vi.mock('@/lib/driveEngine', () => ({
  ensureMediaSettlementFolder: async (...args: unknown[]) => {
    sheets.folders.push(args)
    return 'folder-id'
  },
  copySpreadsheet: async (templateId: string, name: string, folderId: string, shareWith: string) => {
    sheets.copies.push({ templateId, name, folderId, shareWith })
    return `copy-${sheets.copies.length}`
  },
  deleteFile: async () => undefined,
}))

const { processSettlement, getPreviousMeterReadings, getCurrentMeterReadings } = await import(
  '@/app/(dashboard)/rozlicz-media/actions'
)

const db = createTestDbClient()
const ADMIN_EMAIL = `${E2E_PREFIX.toLowerCase()}admin@example.invalid`

patchAppConfigForSuite({ admin_email: ADMIN_EMAIL })

afterAll(async () => {
  await purgeAllTestData(db)
})

beforeEach(() => {
  sheets.outputs = {}
  sheets.missing = []
  sheets.written = []
  sheets.exports = []
  sheets.folders = []
  sheets.copies = []
})

const YEAR = 2001
const MONTH = 3

// Grupa z dwoma najemcami: A ma e-mail (x2) i umowę z mediami, B nie ma e-maila.
async function seed(options: { groupOverrides?: Parameters<typeof createSettlementGroup>[1] } = {}) {
  const property = await createProperty(db, { address1: 'ul. Wodna 5', address2: 'lok. 3' })
  const emailA = testEmail('a')
  const emailA2 = testEmail('a2')
  const tenantA = await createTenant(db, { propertyId: property.id, email: emailA, email2: emailA2, firstName: 'Anna' })
  const tenantB = await createTenant(db, { propertyId: property.id, firstName: 'Bogdan' })
  const contractA = await createContract(db, tenantA.id, { has_media_invoice: true })
  const contractB = await createContract(db, tenantB.id, { has_media_invoice: true })

  const group = await createSettlementGroup(db, {
    propertyIds: [property.id],
    input_mapping_json: {
      Liczniki: {
        'Woda - odczyt': { range: 'WodaOdczyt', source: 'user', save_key: 'woda' },
        'Woda - poprzedni': { range: 'WodaPoprzedni', source: 'db', db_key: 'woda' },
        Adres: { range: 'Adres', source: 'auto', auto_type: 'property_address' },
      },
    },
    output_mapping_json: [
      { range: 'KwotaA', tenant_id: tenantA.id, type: 'MEDIA', email_pdfs: ['Nota'] },
      { range: 'KwotaB', tenant_id: tenantB.id, type: 'MEDIA', email_pdfs: ['Nota'] },
    ],
    pdf_sheets_json: [
      { tab: 'Nota', name: 'Nota' },
      { tab: 'Zestawienie', name: 'Zestawienie' },
    ],
    ...options.groupOverrides,
  })
  sheets.outputs = { KwotaA: '123,45', KwotaB: '50.00' }

  return { property, tenantA, tenantB, contractA, contractB, emailA, emailA2, group }
}

async function invoicesOf(tenantId: number) {
  const { data, error } = await db.from('invoices').select('*').eq('tenant_id', tenantId)
  if (error) throw error
  return data ?? []
}

async function settlementsOf(groupId: number) {
  const { data, error } = await db.from('media_settlements').select('*').eq('group_id', groupId)
  if (error) throw error
  return data ?? []
}

describe('processSettlement - ścieżka pozytywna', () => {
  test('zapisuje rozliczenie, należności bez numeru, PDF-y w Storage i wysyła maile', async () => {
    const { property, tenantA, tenantB, contractA, contractB, emailA, emailA2, group } = await seed()

    const results = await processSettlement(group.id, { WodaOdczyt: '120,5' }, MONTH, YEAR)

    expect(results).toEqual([
      { tenantName: `Anna ${tenantA.last_name}`, amount: 123.45, invoiceNumber: null, emailError: undefined },
      { tenantName: `Bogdan ${tenantB.last_name}`, amount: 50, invoiceNumber: null, emailError: undefined },
    ])

    // Kopia szablonu w Drive: struktura folderów i nazwa oznaczona środowiskiem.
    expect(sheets.folders[0].slice(1)).toEqual(['PREVIEW', YEAR, MONTH, group.name])
    expect(sheets.copies).toEqual([
      {
        templateId: 'template-sheet-id',
        name: `Media 03/2001 – ${group.name} [PREVIEW]`,
        folderId: 'folder-id',
        shareWith: 'service-account@test.invalid',
      },
    ])

    // media_settlements: jedno rozliczenie z listą wgranych PDF-ów.
    const [settlement] = await settlementsOf(group.id)
    expect(settlement).toMatchObject({ month: MONTH, year: YEAR, spreadsheet_id: 'copy-1' })
    const pdfs = settlement.drive_pdf_ids as { name: string; id: string }[]
    expect(pdfs.map((p) => p.name).sort()).toEqual(['Nota', 'Zestawienie'])
    for (const pdf of pdfs) expect(pdf.id.startsWith(`PREVIEW/${YEAR}/${MONTH}/`)).toBe(true)

    // Należności (nie faktury!): number = null, powiązane z umową i rozliczeniem.
    const [invoiceA] = await invoicesOf(tenantA.id)
    const [invoiceB] = await invoicesOf(tenantB.id)
    expect(invoiceA).toMatchObject({
      type: 'MEDIA',
      number: null,
      month: MONTH,
      year: YEAR,
      contract_id: contractA.id,
      media_settlement_id: settlement.id,
      source: 'MANUAL',
    })
    expect(Number(invoiceA.amount)).toBe(123.45)
    expect(invoiceB).toMatchObject({ contract_id: contractB.id, media_settlement_id: settlement.id })
    expect(Number(invoiceB.amount)).toBe(50)

    // Do arkusza trafiły odczyt użytkownika (przecinek -> kropka) i adres z nieruchomości.
    expect(sheets.written).toHaveLength(1)
    expect(sheets.written[0].values).toMatchObject({ WodaOdczyt: '120.5', Adres: 'lok. 3, ul. Wodna 5' })

    // E-mail: tylko najemca z adresem, do obu adresów, z właściwym załącznikiem.
    const tenantMails = mailbox.sent.filter((m) => m.to !== ADMIN_EMAIL)
    expect(tenantMails).toHaveLength(1)
    expect(tenantMails[0].to).toEqual([emailA, emailA2])
    expect(tenantMails[0].subject).toBe(`[PREVIEW] ${property.name} – Media: Faktura media 03/2001`)
    expect(tenantMails[0].attachments.map((a) => a.filename)).toEqual(['Nota_03_2001.pdf'])
    expect(tenantMails[0].attachments[0].content.subarray(0, 4).toString()).toBe('%PDF')

    // Podsumowanie dla administratora z kwotami per najemca.
    const adminMails = mailbox.sent.filter((m) => m.to === ADMIN_EMAIL)
    expect(adminMails).toHaveLength(1)
    expect(adminMails[0].subject).toBe(`[PREVIEW] Rozliczenie mediów – ${group.name} – 03/${YEAR}`)
    expect(adminMails[0].html).toContain(`Anna ${tenantA.last_name}`)
    expect(adminMails[0].html).toContain(`Bogdan ${tenantB.last_name}`)

    // PDF-y rozliczenia (PREVIEW/...) i kopia załącznika maila (preview/emails/...) w Storage.
    const settlementUploads = storage.uploads.filter((u) => u.path.startsWith(`PREVIEW/${YEAR}/${MONTH}/`))
    expect(settlementUploads).toHaveLength(2)
    expect(settlementUploads.every((u) => u.bucket === 'invoices' && u.contentType === 'application/pdf')).toBe(true)
    expect(storage.uploads.filter((u) => u.path.startsWith('preview/emails/'))).toHaveLength(1)
  })

  test('bez zdefiniowanych zakładek PDF eksportuje cały arkusz jako jeden plik', async () => {
    const { group } = await seed({ groupOverrides: { pdf_sheets_json: [] } })

    await processSettlement(group.id, { WodaOdczyt: '1' }, MONTH, YEAR)

    expect(sheets.exports).toEqual([{ sheetId: 'copy-1', gid: undefined }])
    const [settlement] = await settlementsOf(group.id)
    expect(settlement.drive_pdf_ids).toHaveLength(1)
    expect((settlement.drive_pdf_ids as { name: string }[])[0].name.startsWith('Media 03-2001')).toBe(true)
  })

  test('błąd wartości z arkusza (#DIV/0!) daje kwotę 0, a pusty wynik pomija najemcę', async () => {
    const { tenantA, tenantB, group } = await seed()
    sheets.outputs = { KwotaA: '#DIV/0!', KwotaB: '' }

    const results = await processSettlement(group.id, { WodaOdczyt: '1' }, MONTH, YEAR)

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ amount: 0 })
    const [invoiceA] = await invoicesOf(tenantA.id)
    expect(Number(invoiceA.amount)).toBe(0)
    expect(await invoicesOf(tenantB.id)).toHaveLength(0)
  })

  test('ponowne rozliczenie tego samego miesiąca nie dubluje rozliczenia, należności ani odczytów', async () => {
    const { tenantA, tenantB, group } = await seed()

    await processSettlement(group.id, { WodaOdczyt: '10' }, MONTH, YEAR)
    await processSettlement(group.id, { WodaOdczyt: '10' }, MONTH, YEAR)

    const settlements = await settlementsOf(group.id)
    expect(settlements).toHaveLength(1)
    expect(settlements[0].spreadsheet_id).toBe('copy-2') // wskazuje na najnowszą kopię arkusza
    expect(await invoicesOf(tenantA.id)).toHaveLength(1)
    expect(await invoicesOf(tenantB.id)).toHaveLength(1)
    const { data: readings } = await loose(db).from('media_meter_readings').select('key').eq('group_id', group.id)
    expect(readings).toHaveLength(1)
    // Uwaga: ignoreDuplicates zostawia PIERWSZĄ kwotę należności - poprawione odczyty
    // przy ponownym rozliczeniu nie zmieniają już zapisanego zobowiązania.
  })
})

describe('processSettlement - błędy', () => {
  test('ujemna kwota -> wyjątek i brak należności', async () => {
    const { tenantA, tenantB, group } = await seed()
    sheets.outputs = { KwotaA: '-15,00', KwotaB: '50,00' }

    await expect(processSettlement(group.id, { WodaOdczyt: '1' }, MONTH, YEAR)).rejects.toThrow(/Ujemna kwota \(-15 zł\) dla zakresu KwotaA/)

    expect(await invoicesOf(tenantA.id)).toHaveLength(0)
    expect(await invoicesOf(tenantB.id)).toHaveLength(0)
    expect(mailbox.sent).toHaveLength(0)
  })

  test.each([
    ['umowa bez opcji rozliczania mediów', { has_media_invoice: false }],
    ['nieaktywna umowa', { is_active: false }],
  ])('najemca: %s -> oczekiwany błąd i brak należności', async (_label, contractChange) => {
    const { tenantA, contractA, group } = await seed()
    await db.from('contracts').update(contractChange).eq('id', contractA.id)

    await expect(processSettlement(group.id, { WodaOdczyt: '1' }, MONTH, YEAR)).rejects.toThrow(
      /nie posiada aktywnej umowy z włączoną opcją rozliczania mediów/,
    )

    expect(await invoicesOf(tenantA.id)).toHaveLength(0)
    expect(mailbox.sent).toHaveLength(0)
  })

  test('brakujące named ranges w arkuszu -> błąd z listą i brak zapisu rozliczenia', async () => {
    const { group } = await seed()
    sheets.missing = ['WodaOdczyt', 'Adres']

    await expect(processSettlement(group.id, { WodaOdczyt: '1' }, MONTH, YEAR)).rejects.toThrow(
      'Brakujące named ranges w arkuszu: WodaOdczyt, Adres',
    )

    expect(await settlementsOf(group.id)).toHaveLength(0)
    expect(storage.uploads).toHaveLength(0)
  })

  test('awaria wgrania PDF do Storage -> błąd i brak należności', async () => {
    const { tenantA, group } = await seed()
    storage.failUploads = true

    await expect(processSettlement(group.id, { WodaOdczyt: '1' }, MONTH, YEAR)).rejects.toThrow(/Błąd wgrywania pliku/)

    expect(await invoicesOf(tenantA.id)).toHaveLength(0)
  })

  test('awaria wysyłki do najemcy nie zatrzymuje rozliczenia - błąd trafia do wyniku', async () => {
    const { tenantA, group } = await seed()
    mailbox.failIf = (mail) => mail.to !== ADMIN_EMAIL

    const results = await processSettlement(group.id, { WodaOdczyt: '1' }, MONTH, YEAR)

    expect(results[0].emailError).toBe('symulowana awaria SMTP')
    expect(results[1].emailError).toBeUndefined() // najemca bez e-maila
    expect(await invoicesOf(tenantA.id)).toHaveLength(1)
  })

  test('podsumowanie dla admina jest best-effort - jego awaria nie psuje rozliczenia', async () => {
    const { tenantA, group, emailA } = await seed()
    mailbox.failIf = (mail) => mail.to === ADMIN_EMAIL

    const results = await processSettlement(group.id, { WodaOdczyt: '1' }, MONTH, YEAR)

    expect(results).toHaveLength(2)
    expect(mailbox.sent.map((m) => m.to)).toEqual([[emailA, expect.any(String)]])
    expect(await invoicesOf(tenantA.id)).toHaveLength(1)
  })
})

describe('odczyty liczników', () => {
  test('odczyt z "save_key" trafia do bazy i jest "poprzednim" w kolejnym miesiącu', async () => {
    const { group } = await seed()

    await processSettlement(group.id, { WodaOdczyt: '120,5' }, MONTH, YEAR)

    expect(await getCurrentMeterReadings(group.id, MONTH, YEAR)).toEqual({ woda: 120.5 })
    expect(await getPreviousMeterReadings(group.id, MONTH + 1, YEAR)).toEqual({ woda: 120.5 })
    // "Poprzednie" to wyłącznie wcześniejsze miesiące - nie ten sam.
    expect(await getPreviousMeterReadings(group.id, MONTH, YEAR)).toEqual({})

    await processSettlement(group.id, { WodaOdczyt: '130' }, MONTH + 1, YEAR)
    // Pole source:"db" zostaje uzupełnione poprzednim odczytem.
    expect(sheets.written.at(-1)!.values).toMatchObject({ WodaPoprzedni: 120.5, WodaOdczyt: '130' })
  })

  test('nadpisanie poprzedniego odczytu (override) ma pierwszeństwo przed wartością z bazy', async () => {
    const { group } = await seed()
    await processSettlement(group.id, { WodaOdczyt: '120' }, MONTH, YEAR)

    await processSettlement(group.id, { WodaOdczyt: '140' }, MONTH + 1, YEAR, { woda: '125,25' })

    expect(sheets.written.at(-1)!.values).toMatchObject({ WodaPoprzedni: 125.25 })
  })

  test('getPreviousMeterReadings bierze najnowszy wcześniejszy odczyt, także przez granicę roku', async () => {
    const { group } = await seed()
    const rows = [
      { month: 11, year: 2001, value: 5 },
      { month: 12, year: 2001, value: 7 },
      { month: 2, year: 2002, value: 99 }, // późniejszy niż pytany miesiąc
    ].map((r) => ({ ...r, group_id: group.id, key: 'woda' }))
    await loose(db).from('media_meter_readings').insert(rows)

    expect(await getPreviousMeterReadings(group.id, 1, 2002)).toEqual({ woda: 7 })
    expect(await getPreviousMeterReadings(group.id, 3, 2002)).toEqual({ woda: 99 })
  })
})
