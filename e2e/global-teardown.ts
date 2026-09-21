import { createTestDbClient, purgeAllTestData } from './support/db'

// Siatka bezpieczeństwa: po całym przebiegu usuwa wszystko z prefiksem E2E_TEST__,
// także pozostałości po testach, które padły lub zostały ubite w trakcie.
export default async function globalTeardown() {
  await purgeAllTestData(createTestDbClient())
}
