import { Router } from 'express'

export const receipts = Router()

// Phase 5 fills this in: upload to a private S3 bucket using the EC2 instance's
// IAM role (no access keys anywhere in this process), then hand back a
// short-lived pre-signed URL for viewing.
receipts.post('/expenses/:id/receipt', (_req, res) => {
  res.status(501).json({ error: 'receipt upload lands in Phase 5 (S3 + IAM)' })
})

receipts.get('/expenses/:id/receipt', (_req, res) => {
  res.status(501).json({ error: 'pre-signed receipt URLs land in Phase 5 (S3 + IAM)' })
})
