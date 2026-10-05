// Klient bazy i sprzątanie danych testowych są współdzielone z testami
// integracyjnymi (__tests__/integration/) - implementacja żyje w tests-support/.
export {
  createTestDbClient,
  E2E_PREFIX,
  deleteTenants,
  deleteProperties,
  deleteSettlementGroups,
  purgeAllTestData,
} from '../../tests-support/db'
