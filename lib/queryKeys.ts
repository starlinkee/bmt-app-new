export const QUERY_KEYS = {
  properties: ['properties'] as const,
  tenants: ['tenants'] as const,
  contracts: ['contracts'] as const,
settlementGroups: ['settlement_groups'] as const,
  rentInvoices: (month: number, year: number) =>
    ['rent_invoices', month, year] as const,
}
