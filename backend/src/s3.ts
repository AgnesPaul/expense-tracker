import { S3Client } from '@aws-sdk/client-s3'
import { config } from './config'

// Note what is absent: no access key, no secret, no credentials file.
//
// On EC2 the SDK asks the instance metadata service (169.254.169.254) for
// temporary credentials belonging to whichever IAM role is attached, and
// refreshes them before they expire. Nothing is stored on disk, so there is
// nothing to leak.
//
// Locally the same SDK falls back to ~/.aws/credentials or AWS_* env vars —
// which is why this file needs no conditional logic for "dev vs prod".
export const s3 = new S3Client({ region: config.awsRegion })

export const receiptKey = (expenseId: number, filename: string) => {
  const ext = (filename.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8)
  // "Folders" in S3 are an illusion — this whole string is the object's key.
  return `receipts/${expenseId}/${Date.now()}.${ext}`
}
