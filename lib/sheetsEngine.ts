import { google } from 'googleapis'

function getServiceAccountAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''
  const json = raw.startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf-8')

  const key = JSON.parse(json)
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  })
}

type InputMapping = Record<string, string>  // label → range (e.g. "Odczyt wody": "B2")
type OutputMapping = Record<string, string> // label → range

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

export async function exportSheetAsPdf(
  spreadsheetId: string,
  gid?: string,
): Promise<Buffer> {
  const auth = getServiceAccountAuth()
  const accessToken = await (await auth.getClient()).getAccessToken()
  const token = (accessToken as { token: string }).token

  const url =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export` +
    `?format=pdf&portrait=true&fitw=true${gid ? `&gid=${gid}` : ''}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`PDF export failed: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  return buffer
}
