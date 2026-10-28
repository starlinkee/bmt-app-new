import { redirect } from 'next/navigation'
import { getImportToggles, getUnmatchedTransactions } from './actions'
import { UploadForm } from './upload-form'

export default async function ImportPage() {
  const unmatched = await getUnmatchedTransactions()
  
  if (unmatched && unmatched.length > 0) {
    redirect('/import/reconcile')
  }

  const toggles = await getImportToggles()

  return <UploadForm pekaoEnabled={toggles.pekao} millenniumEnabled={toggles.millennium} />
}
