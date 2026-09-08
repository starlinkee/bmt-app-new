import { redirect } from 'next/navigation'
import { getUnmatchedTransactions } from './actions'
import { UploadForm } from './upload-form'

export default async function ImportPage() {
  const unmatched = await getUnmatchedTransactions()
  
  if (unmatched && unmatched.length > 0) {
    redirect('/import/reconcile')
  }

  return <UploadForm />
}
