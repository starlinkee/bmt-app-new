import { google } from 'googleapis'

function parseServiceAccountJson() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  return JSON.parse(json)
}

function getServiceAccountAuth() {
  return new google.auth.GoogleAuth({
    credentials: parseServiceAccountJson(),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  })
}

export function getServiceAccountEmail(): string {
  return parseServiceAccountJson().client_email as string
}

// Named range defined in the spreadsheet (Insert → Named ranges), e.g. "OdczytWody"
type NamedRange = string
type InputMapping = Record<string, NamedRange>  // label → named range
type OutputMapping = Record<string, NamedRange> // label → named range

export async function validateNamedRanges(
  spreadsheetId: string,
  ranges: string[],
): Promise<{ missing: string[] }> {
  const auth = getServiceAccountAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'namedRanges.name',
  })

  const defined = new Set((data.namedRanges ?? []).map((nr) => nr.name!))
  const missing = ranges.filter((r) => !defined.has(r))
  return { missing }
}

export async function writeInputValues(
  spreadsheetId: string,
  inputMapping: InputMapping,
  values: Record<string, string | number>,
) {
  const auth = getServiceAccountAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const data = Object.entries(inputMapping)
    .filter(([label]) => values[label] !== undefined)
    .map(([label, range]) => ({
      range,
      values: [[values[label]]],
    }))

  if (!data.length) return

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  })
}

export async function triggerRecalc(spreadsheetId: string) {
  // Wymuś przeliczenie przez write+delete komórki pomocniczej
  const auth = getServiceAccountAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const range = 'A1'
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [['']] },
  })
}

export async function readOutputValues(
  spreadsheetId: string,
  outputMapping: OutputMapping,
): Promise<Record<string, string>> {
  const auth = getServiceAccountAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const ranges = Object.values(outputMapping)
  if (!ranges.length) return {}

  const { data } = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
  })

  const result: Record<string, string> = {}
  const valueRanges = data.valueRanges ?? []
  const labels = Object.keys(outputMapping)

  for (let i = 0; i < labels.length; i++) {
    const val = valueRanges[i]?.values?.[0]?.[0] ?? ''
    result[labels[i]] = String(val)
  }

  return result
}

export async function getSheetGidByName(
  spreadsheetId: string,
  sheetName: string,
): Promise<string | undefined> {
  const auth = getServiceAccountAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  })
  const sheet = (data.sheets ?? []).find((s) => s.properties?.title === sheetName)
  return sheet?.properties?.sheetId?.toString()
}

export async function stripSpreadsheetColors(spreadsheetId: string): Promise<void> {
  const auth = getServiceAccountAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.sheetId',
  })

  const requests = (data.sheets ?? []).map((sheet) => ({
    repeatCell: {
      range: {
        sheetId: sheet.properties!.sheetId!,
        startRowIndex: 0,
        endRowIndex: 500,
        startColumnIndex: 0,
        endColumnIndex: 26,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 1, green: 1, blue: 1 },
          textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } },
        },
      },
      fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor',
    },
  }))

  if (!requests.length) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  })
}

function parseRange(range: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const m = range.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/)
  if (!m) return null
  const col = (s: string) => {
    let n = 0
    for (const c of s.toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64
    return n - 1
  }
  return { r1: parseInt(m[2]) - 1, c1: col(m[1]), r2: parseInt(m[4]) - 1, c2: col(m[3]) }
}

export async function exportSheetAsPdf(
  spreadsheetId: string,
  gid?: string,
  opts?: { printRange?: string; portrait?: boolean },
): Promise<Buffer> {
  const auth = getServiceAccountAuth()
  const accessToken = await (await auth.getClient()).getAccessToken()
  const token = (accessToken as { token: string }).token

  let rangeParams = ''
  if (opts?.printRange) {
    const r = parseRange(opts.printRange)
    if (r) rangeParams = `&r1=${r.r1}&c1=${r.c1}&r2=${r.r2}&c2=${r.c2}`
  }

  const portrait = opts?.portrait !== false

  const url =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export` +
    `?format=pdf&portrait=${portrait}&fitw=true${gid ? `&gid=${gid}` : ''}${rangeParams}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`PDF export failed: ${res.status}`)

  return Buffer.from(await res.arrayBuffer())
}
