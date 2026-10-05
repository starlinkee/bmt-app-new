import { E2E_PREFIX, type Db } from './db'

// Fabryki danych dla testów integracyjnych - zakładają rekordy bezpośrednio w
// bazie (service_role), zawsze z prefiksem E2E_TEST__ w polu, po którym
// `purgeAllTestData` je rozpoznaje (nazwisko najemcy, nazwa nieruchomości/grupy,
// tytuł transakcji, adres e-mail w logach). Sprzątanie: afterAll w teście +
// global teardown integracji.

export function uniq(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Adres e-mail, który nigdy nie istnieje, ale zawiera prefiks do sprzątania logów. */
export function testEmail(label = 'najemca'): string {
  return `${E2E_PREFIX.toLowerCase()}${label}_${uniq()}@example.invalid`
}

/**
 * Syntetyczny, 26-cyfrowy rachunek (z prefiksem PL) o losowych cyfrach - tak
 * długi i losowy, żeby nie dało się go przypadkiem dopasować (dokładnie ani
 * sufiksem) do rachunku prawdziwego najemcy w bazie preview.
 */
export function fakeAccount(): string {
  const digits = Array.from({ length: 24 }, () => Math.floor(Math.random() * 10)).join('')
  return `PL99${digits}`
}

function must<T extends { error: { message: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`Fabryka testowa (${what}): ${res.error.message}`)
  return res
}

export async function createProperty(
  db: Db,
  overrides: { name?: string; type?: string; address1?: string; address2?: string | null } = {},
) {
  const { data } = must(
    await db
      .from('properties')
      .insert({
        name: overrides.name ?? `${E2E_PREFIX}Nieruchomość ${uniq()}`,
        address1: overrides.address1 ?? 'ul. Testowa 1',
        address2: overrides.address2 ?? null,
        type: overrides.type ?? 'Mieszkanie',
      })
      .select()
      .single(),
    'properties',
  )
  return data!
}

export type TenantOverrides = Partial<{
  propertyId: number
  email: string | null
  email2: string | null
  accounts: string[]
  firstName: string
  tenantType: string
  companyName: string | null
}>

export async function createTenant(db: Db, overrides: TenantOverrides = {}) {
  const propertyId = overrides.propertyId ?? (await createProperty(db)).id
  const { data } = must(
    await db
      .from('tenants')
      .insert({
        tenant_type: overrides.tenantType ?? 'PRIVATE',
        first_name: overrides.firstName ?? 'Integracja',
        last_name: `${E2E_PREFIX}Najemca ${uniq()}`,
        company_name: overrides.companyName ?? null,
        property_id: propertyId,
        email: overrides.email === undefined ? null : overrides.email,
        email2: overrides.email2 === undefined ? null : overrides.email2,
        bank_accounts_as_text: (overrides.accounts ?? []).join('\n'),
      })
      .select()
      .single(),
    'tenants',
  )
  return data!
}

export async function createContract(
  db: Db,
  tenantId: number,
  overrides: Partial<{
    contract_type: string
    rent_amount: number
    has_media_invoice: boolean
    start_date: string
    end_date: string | null
    is_active: boolean
  }> = {},
) {
  const { data } = must(
    await db
      .from('contracts')
      .insert({
        contract_type: 'PRIVATE',
        rent_amount: 500,
        has_media_invoice: false,
        start_date: '2026-01-01',
        is_active: true,
        tenant_id: tenantId,
        ...overrides,
      })
      .select()
      .single(),
    'contracts',
  )
  return data!
}

export async function createInvoice(
  db: Db,
  args: { tenantId: number; amount: number; month?: number; year?: number; type?: 'RENT' | 'MEDIA'; contractId?: number | null },
) {
  const { data } = must(
    await db
      .from('invoices')
      .insert({
        type: args.type ?? 'RENT',
        number: null,
        amount: args.amount,
        month: args.month ?? 1,
        year: args.year ?? 2001,
        tenant_id: args.tenantId,
        contract_id: args.contractId ?? null,
        source: 'MANUAL',
      })
      .select()
      .single(),
    'invoices',
  )
  return data!
}

export async function createTransaction(
  db: Db,
  args: {
    tenantId: number | null
    amount: number
    date?: string
    status?: string
    type?: string
    title?: string
    category?: 'RENT' | 'MEDIA' | null
    bankAccount?: string | null
  },
) {
  const { data } = must(
    await db
      .from('transactions')
      .insert({
        type: args.type ?? 'BANK',
        status: args.status ?? 'MATCHED',
        amount: args.amount,
        date: args.date ?? '2001-01-15',
        title: args.title ?? `${E2E_PREFIX}Wpłata ${uniq()}`,
        tenant_id: args.tenantId,
        category: args.category ?? null,
        bank_account: args.bankAccount ?? null,
      })
      .select()
      .single(),
    'transactions',
  )
  return data!
}

export async function createEmailLog(
  db: Db,
  args: { to: string; subject?: string; body?: string; sentAt?: string; attachments?: { name: string; path: string }[] },
) {
  const { data } = must(
    await db
      .from('email_logs')
      .insert({
        to_email: args.to,
        subject: args.subject ?? `${E2E_PREFIX}Temat ${uniq()}`,
        body: args.body ?? '<p>treść</p>',
        ...(args.sentAt ? { sent_at: args.sentAt } : {}),
        attachments: args.attachments ?? null,
      })
      .select()
      .single(),
    'email_logs',
  )
  return data!
}

export async function createSettlementGroup(
  db: Db,
  args: {
    propertyIds?: number[]
    input_mapping_json?: Record<string, unknown>
    output_mapping_json?: unknown[]
    pdf_sheets_json?: unknown[]
    email_subject_template?: string | null
    email_body_template?: string | null
  } = {},
) {
  const { data } = must(
    await db
      .from('settlement_groups')
      .insert({
        name: `${E2E_PREFIX}Grupa ${uniq()}`,
        spreadsheet_id: 'template-sheet-id',
        input_mapping_json: (args.input_mapping_json ?? {}) as never,
        output_mapping_json: (args.output_mapping_json ?? []) as never,
        pdf_sheets_json: (args.pdf_sheets_json ?? []) as never,
        email_subject_template: args.email_subject_template ?? null,
        email_body_template: args.email_body_template ?? null,
      })
      .select()
      .single(),
    'settlement_groups',
  )
  if (args.propertyIds?.length) {
    must(
      await db.from('settlement_group_properties').insert(
        args.propertyIds.map((propertyId) => ({ settlement_group_id: data!.id, property_id: propertyId })),
      ),
      'settlement_group_properties',
    )
  }
  return data!
}
