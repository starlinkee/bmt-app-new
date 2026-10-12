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

const GUARDS = new Set(['requireUser', 'guardTestPanel'])

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
