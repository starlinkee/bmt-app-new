export const QUERY_KEYS = {
  properties: ['properties'] as const,
  tenants: ['tenants'] as const,
  contracts: ['contracts'] as const,
  settlementGroups: ['settlement_groups'] as const,
  rentInvoices: (month: number, year: number) =>
    ['rent_invoices', month, year] as const,
  kontrolaPlatnosci: ['kontrola_platnosci'] as const,
  tenantWithBalance: (tenantId: number) => ['tenant_with_balance', tenantId] as const,
  tenantStatement: (tenantId: number) => ['tenant_statement', tenantId] as const,
  auditLog: ['audit_log'] as const,
}
