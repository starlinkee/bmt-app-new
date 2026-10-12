import { describe, test, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

// Strażnik: każda eksportowana funkcja w pliku z 'use server' musi zaczynać się
// od `await requireUser()` (albo `await guardTestPanel()` w testowanie/actions.ts,
// które woła requireUser + sprawdza flagę panelu testowego). 'use server' robi
// z każdego eksportu publiczny endpoint HTTP, więc brak strażnika = dziura.

const ROOT = path.resolve(__dirname, '../..')

// Wyjątki (ścieżki względem korzenia repo), każdy z uzasadnieniem:
const EXCEPTIONS: Record<string, string> = {
  'app/login/actions.ts': 'publiczne z natury (logowanie)',
  'app/forgot-password/actions.ts': 'publiczne z natury (reset hasła)',
  'lib/auth.ts': 'helpery auth (requireApiAuth/requireAuth) - nie są akcjami biznesowymi',
}

const GUARDS = new Set(['requireUser', 'guardTestPanel', 'getUserClient'])

// Pliki zmigrowane na klienta z sesją (RLS "owner access"): nie wolno im importować
// klienta service role - wtedy RLS byłby omijany. Lista rośnie z kolejnymi slice'ami.
const SESSION_CLIENT_FILES = [
  'app/(dashboard)/najemcy/actions.ts',
  'app/(dashboard)/najemcy/[id]/actions.ts',
  'app/(dashboard)/nieruchomosci/actions.ts',
  'app/(dashboard)/umowy/actions.ts',
  'app/(dashboard)/import/actions.ts',
  'app/(dashboard)/kontrola-platnosci/actions.ts',
  'app/(dashboard)/historia/actions.ts',
]

// Moduły z lib/, które same tworzą klienta service role (omijają RLS), a mimo to
// mogą być używane w plikach zmigrowanych - jawna lista z uzasadnieniem.
// GATED = dozwolone tylko w funkcji, która woła assertTenantOwned (sprawdzenie
// własności najemcy klientem sesji PRZED użyciem).
const SERVICE_LIB_ALLOWED: Record<string, { why: string; gated?: boolean }> = {
  '@/lib/audit': { why: 'logAudit - zapis z ownerId' },
  '@/lib/app-config': { why: 'jedyny odczyt app_config service rolą do slice 3 (per konto)' },
  '@/lib/email': { why: 'wysyłka e-mail + log w email_logs (legacy owner do slice 4)' },
  '@/lib/statement': { why: 'wyciąg najemcy - po assertTenantOwned', gated: true },
  '@/lib/balance': { why: 'saldo najemcy - po assertTenantOwned', gated: true },
}

// Publiczna strona odczytów liczników (bez sesji, autoryzacja tokenem najemcy):
// akcje zaczynają się od resolveReadingAccess(token, groupId), poza jawną listą
// funkcji publicznych, które zwracają tylko datę/komunikat albo same sprawdzają token.
const TOKEN_GUARD_FILES: Record<string, { guard: string; publicFns: Record<string, string> }> = {
  'app/odczyty/[token]/actions.ts': {
    guard: 'resolveReadingAccess',
    publicFns: {
      getTenantReadingsContext: 'sam wyszukuje najemcę po tokenie, zły token -> null',
      getTargetMonthYear: 'zwraca tylko datę okna odczytów',
      getClosedWindowMessage: 'zwraca tylko tekst komunikatu o zamkniętym oknie',
    },
  },
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function hasUseServerDirective(sf: ts.SourceFile) {
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === 'use server') return true
    } else break
  }
  return false
}

function containsInlineUseServer(sf: ts.SourceFile) {
  let found = false
  const visit = (node: ts.Node) => {
    if (ts.isBlock(node)) {
      for (const st of node.statements) {
        if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && st.expression.text === 'use server') found = true
        else break
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

function isGuardCall(st: ts.Statement | undefined, guards: Set<string> = GUARDS) {
  if (!st) return false
  // `await guard()` albo `const x = await guard(...)` (resolveReadingAccess zwraca klucze)
  let e: ts.Expression | undefined
  if (ts.isExpressionStatement(st)) e = st.expression
  else if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) e = st.declarationList.declarations[0].initializer
  if (!e || !ts.isAwaitExpression(e) || !ts.isCallExpression(e.expression)) return false
  const callee = e.expression.expression
  return ts.isIdentifier(callee) && guards.has(callee.text)
}

type Problem = string

function checkFunctionBody(label: string, fn: ts.FunctionLikeDeclaration, guards: Set<string> = GUARDS): Problem | null {
  if (!fn.body || !ts.isBlock(fn.body)) return `${label}: brak bloku z ciałem funkcji`
  return isGuardCall(fn.body.statements[0], guards) ? null : `${label}: pierwsza instrukcja nie jest wywołaniem strażnika (await requireUser() / guardTestPanel() / resolveReadingAccess())`
}

function problemsIn(file: string): Problem[] {
  const rel = path.relative(ROOT, file).split(path.sep).join('/')
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const problems: Problem[] = []
  if (containsInlineUseServer(sf)) problems.push(`${rel}: inline 'use server' w ciele funkcji (niedozwolone)`)
  if (!hasUseServerDirective(sf)) return problems
  if (rel in EXCEPTIONS) return problems
  const tokenRule = TOKEN_GUARD_FILES[rel]
  const guards = tokenRule ? new Set([tokenRule.guard]) : GUARDS

  for (const st of sf.statements) {
    const isExported = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (ts.isExportAssignment(st)) {
      const e = st.expression
      if ((ts.isArrowFunction(e) || ts.isFunctionExpression(e))) {
        const p = checkFunctionBody(`${rel} export default`, e, guards)
        if (p) problems.push(p)
      } else problems.push(`${rel}: export default nie jest funkcją`)
      continue
    }
    if (ts.isExportDeclaration(st)) {
      if (!st.isTypeOnly) problems.push(`${rel}: re-eksport w pliku 'use server' (${st.getText()})`)
      continue
    }
    if (!isExported) continue
    if (ts.isFunctionDeclaration(st)) {
      if (tokenRule && st.name && st.name.text in tokenRule.publicFns) continue
      const p = checkFunctionBody(`${rel} ${st.name?.text ?? 'default'}`, st, guards)
      if (p) problems.push(p)
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          const p = checkFunctionBody(`${rel} ${d.name.getText()}`, init, guards)
          if (p) problems.push(p)
        } else problems.push(`${rel}: eksport ${d.name.getText()} nie jest funkcją`)
      }
    } else if (!ts.isTypeAliasDeclaration(st) && !ts.isInterfaceDeclaration(st)) {
      problems.push(`${rel}: nieobsługiwany eksport (${ts.SyntaxKind[st.kind]})`)
    }
  }
  return problems
}

describe("server actions ('use server') wymagają zalogowanego użytkownika", () => {
  test('pliki z reguł tokenowych istnieją, a ich publiczne funkcje są nadal eksportowane', () => {
    for (const [rel, rule] of Object.entries(TOKEN_GUARD_FILES)) {
      const file = path.join(ROOT, rel)
      expect(fs.existsSync(file), `${rel} nie istnieje - usuń z TOKEN_GUARD_FILES`).toBe(true)
      const text = fs.readFileSync(file, 'utf8')
      for (const fn of Object.keys(rule.publicFns)) {
        expect(text, `${rel}: ${fn} nie istnieje - usuń z publicFns`).toMatch(new RegExp(`export async function ${fn}\\b`))
      }
    }
  })

  // Moduły lib/ zawierające createServiceClient (lista liczona skanem lib/**).
  function serviceLibs(): Set<string> {
    const libs = new Set<string>()
    for (const file of walk(path.join(ROOT, 'lib'))) {
      if (!/createServiceClient/.test(fs.readFileSync(file, 'utf8'))) continue
      const rel = path.relative(path.join(ROOT, 'lib'), file).split(path.sep).join('/').replace(/\.(ts|tsx)$/, '')
      libs.add(`@/lib/${rel}`)
    }
    return libs
  }

  // Moduły importowane (statycznie albo import()) w pliku, wraz z funkcją-rodzicem.
  function importsOf(file: string) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const found: { spec: string; enclosing: ts.Node | null }[] = []
    const visit = (node: ts.Node, fn: ts.Node | null) => {
      const next = ts.isFunctionLike(node) ? node : fn
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        found.push({ spec: node.moduleSpecifier.text, enclosing: null })
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0]
        if (arg && ts.isStringLiteralLike(arg)) found.push({ spec: arg.text, enclosing: fn })
      }
      ts.forEachChild(node, (c) => visit(c, next))
    }
    visit(sf, null)
    return found
  }

  function callsAssertTenantOwned(fn: ts.Node) {
    let ok = false
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'assertTenantOwned') ok = true
      ts.forEachChild(n, visit)
    }
    visit(fn)
    return ok
  }

  test('pliki zmigrowane na klienta z sesją istnieją i nie wracają do service role (także przez lib/)', () => {
    const libs = serviceLibs()
    for (const rel of SESSION_CLIENT_FILES) {
      const file = path.join(ROOT, rel)
      expect(fs.existsSync(file), `${rel} nie istnieje - usuń z SESSION_CLIENT_FILES`).toBe(true)
      for (const { spec, enclosing } of importsOf(file)) {
        expect(spec, `${rel} importuje klienta service role`).not.toBe('@/lib/supabase/service')
        if (!libs.has(spec)) continue
        const allowed = SERVICE_LIB_ALLOWED[spec]
        expect(allowed, `${rel} importuje ${spec}, który używa klienta service role (omija RLS)`).toBeDefined()
        if (allowed.gated) {
          expect(
            enclosing && callsAssertTenantOwned(enclosing),
            `${rel}: ${spec} wymaga assertTenantOwned w tej samej funkcji`,
          ).toBeTruthy()
        }
      }
    }
  })

  test('lista dozwolonych bibliotek service wskazuje istniejące moduły lib/', () => {
    const libs = serviceLibs()
    for (const spec of Object.keys(SERVICE_LIB_ALLOWED)) {
      expect(libs.has(spec), `${spec} nie używa już createServiceClient albo nie istnieje - usuń z SERVICE_LIB_ALLOWED`).toBe(true)
    }
  })

  test('pliki z listy wyjątków istnieją', () => {
    for (const rel of Object.keys(EXCEPTIONS)) {
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} nie istnieje - usuń z EXCEPTIONS`).toBe(true)
    }
  })

  test("każda eksportowana funkcja zaczyna się od await requireUser()", () => {
    const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]
    const problems = files.flatMap(problemsIn)
    expect(problems).toEqual([])
  })
})
