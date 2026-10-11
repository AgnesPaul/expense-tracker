import { Router } from 'express'
import multer from 'multer'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config'
import { pool } from '../db'
import { receiptKey, s3 } from '../s3'

export const receipts = Router()

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

// Files are held in memory and streamed straight to S3 — never written to the
// instance's disk. That keeps the server stateless, which is what lets Phase 7
// replace it at will.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, ALLOWED.includes(file.mimetype)),
})

function bucketConfigured(res: import('express').Response) {
  if (config.receiptsBucket) return true
  res.status(501).json({ error: 'RECEIPTS_BUCKET is not set on this server' })
  return false
}

// POST /api/expenses/:id/receipt   (multipart/form-data, field name "file")
receipts.post('/expenses/:id/receipt', upload.single('file'), async (req, res, next) => {
  try {
    if (!bucketConfigured(res)) return
    if (!req.file) return res.status(400).json({ error: 'no file, or unsupported type' })

    const { rows: exists } = await pool.query('SELECT id FROM expenses WHERE id=$1', [req.params.id])
    if (!exists.length) return res.status(404).json({ error: 'no such expense' })

    const key = receiptKey(Number(req.params.id), req.file.originalname)

    await s3.send(new PutObjectCommand({
      Bucket: config.receiptsBucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }))

    // One receipt per expense: replace any previous one, and tidy up S3 so we
    // don't accumulate orphaned objects nobody can reach.
    const { rows: old } = await pool.query(
      'SELECT s3_key FROM receipts WHERE expense_id=$1', [req.params.id])
    await pool.query('DELETE FROM receipts WHERE expense_id=$1', [req.params.id])
    await pool.query(
      'INSERT INTO receipts (expense_id, s3_key, content_type) VALUES ($1,$2,$3)',
      [req.params.id, key, req.file.mimetype])

    for (const r of old) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.receiptsBucket, Key: r.s3_key }))
        .catch((e) => console.error('[s3] could not delete old receipt', e))
    }

    console.log(`[receipt] stored ${key} (${req.file.size} bytes)`)
    res.status(201).json({ ok: true })
  } catch (err) { next(err) }
})

// GET /api/expenses/:id/receipt  → a short-lived link, not the file itself
receipts.get('/expenses/:id/receipt', async (req, res, next) => {
  try {
    if (!bucketConfigured(res)) return

    const { rows } = await pool.query(
      'SELECT s3_key FROM receipts WHERE expense_id=$1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'no receipt' })

    // The bucket stays private. This signs a URL with the server's temporary
    // credentials so the browser can fetch the object directly from S3 for the
    // next few minutes — after which the link is dead.
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: config.receiptsBucket, Key: rows[0].s3_key }),
      { expiresIn: 300 },
    )
    res.json({ url, expires_in: 300 })
  } catch (err) { next(err) }
})
