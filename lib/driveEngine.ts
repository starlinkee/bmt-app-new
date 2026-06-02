import { google } from 'googleapis'
import { Readable } from 'stream'

let _oauthClient: InstanceType<typeof google.auth.OAuth2> | null = null
function getOAuthClient() {
  if (!_oauthClient) {
    _oauthClient = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    )
    _oauthClient.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    })
  }
  return _oauthClient
}

export async function getOrCreateFolder(
  name: string,
  parentId?: string,
): Promise<string> {
  const auth = getOAuthClient()
  const drive = google.drive({ version: 'v3', auth })

  const q = [
    `name = '${name}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    parentId ? `'${parentId}' in parents` : '',
  ]
    .filter(Boolean)
    .join(' and ')

  const { data } = await drive.files.list({
    q,
    fields: 'files(id)',
    pageSize: 1,
  })

  if (data.files?.length) return data.files[0].id!

  const { data: created } = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  })

  return created.id!
}

export async function ensureMonthYearFolder(
  month: number,
  year: number,
  rootFolderId: string,
): Promise<string> {
  const name = `${String(month).padStart(2, '0')}/${year}`
  return getOrCreateFolder(name, rootFolderId)
}

export async function copySpreadsheet(
  templateId: string,
  name: string,
  folderId: string,
  shareWithEmail: string,
): Promise<string> {
  const auth = getOAuthClient()
  const drive = google.drive({ version: 'v3', auth })

  const { data } = await drive.files.copy({
    fileId: templateId,
    requestBody: { name, parents: [folderId] },
    fields: 'id',
  })
  const newId = data.id!

  await drive.permissions.create({
    fileId: newId,
    requestBody: { type: 'user', role: 'writer', emailAddress: shareWithEmail },
    sendNotificationEmail: false,
  })

  return newId
}

export async function ensureYearMonthFolder(
  year: number,
  month: number,
  rootFolderId: string,
): Promise<string> {
  const yearFolder = await getOrCreateFolder(String(year), rootFolderId)
  const monthFolder = await getOrCreateFolder(
    String(month).padStart(2, '0'),
    yearFolder,
  )
  return monthFolder
}

export async function deleteFile(fileId: string): Promise<void> {
  const auth = getOAuthClient()
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.delete({ fileId })
}

export async function uploadPdfToDrive(
  filename: string,
  buffer: Buffer,
  folderId: string,
): Promise<string> {
  const auth = getOAuthClient()
  const drive = google.drive({ version: 'v3', auth })

  const stream = Readable.from(buffer)

  const { data } = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType: 'application/pdf',
      parents: [folderId],
    },
    media: { mimeType: 'application/pdf', body: stream },
    fields: 'id',
  })

  return data.id!
}
