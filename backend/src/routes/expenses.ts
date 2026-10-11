import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db'

export const expenses = Router()

const SELECT = `
  SELECT e.id, e.amount::float8 AS amount, e.note, e.payment_method,
         to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on,
         c.id AS category_id, c.name AS category,
         (r.id IS NOT NULL) AS has_receipt
  FROM expenses e
  JOIN categories c ON c.id = e.category_id
  LEFT JOIN receipts r ON r.expense_id = e.id`

const upsertBody = z.object({
  amount: z.number().positive(),
  category_id: z.number().int().positive(),
  note: z.string().max(500).optional().nullable(),
  payment_method: z.enum(['cash', 'card', 'upi', 'netbanking', 'other']).default('cash'),
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// GET /expenses?month=YYYY-MM&category_id=3&q=coffee
expenses.get('/expenses', async (req, res, next) => {
  try {
    const where: string[] = []
    const params: unknown[] = []

    if (typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)) {
      params.push(`${req.query.month}-01`)
      where.push(`date_trunc('month', e.spent_on) = date_trunc('month', $${params.length}::date)`)
    }
    if (typeof req.query.category_id === 'string' && req.query.category_id) {
      params.push(Number(req.query.category_id))
      where.push(`e.category_id = $${params.length}`)
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      params.push(`%${req.query.q.trim()}%`)
      where.push(`e.note ILIKE $${params.length}`)
    }

    const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY e.spent_on DESC, e.id DESC LIMIT 500`
    const { rows } = await pool.query(sql, params)
    res.json(rows)
  } catch (err) { next(err) }
})

expenses.post('/expenses', async (req, res, next) => {
  try {
    const b = upsertBody.parse(req.body)
    const { rows } = await pool.query(
      `INSERT INTO expenses (amount, category_id, note, payment_method, spent_on)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [b.amount, b.category_id, b.note ?? null, b.payment_method, b.spent_on],
    )
    const { rows: full } = await pool.query(`${SELECT} WHERE e.id = $1`, [rows[0].id])
    console.log(`[expenses] created id=${rows[0].id} amount=${b.amount}`)
    res.status(201).json(full[0])
  } catch (err) { next(err) }
})

expenses.put('/expenses/:id', async (req, res, next) => {
  try {
    const b = upsertBody.parse(req.body)
    const { rowCount } = await pool.query(
      `UPDATE expenses SET amount=$1, category_id=$2, note=$3,
              payment_method=$4, spent_on=$5, updated_at=now()
       WHERE id=$6`,
      [b.amount, b.category_id, b.note ?? null, b.payment_method, b.spent_on, req.params.id],
    )
    if (!rowCount) return res.status(404).json({ error: 'not found' })
    const { rows } = await pool.query(`${SELECT} WHERE e.id = $1`, [req.params.id])
    res.json(rows[0])
  } catch (err) { next(err) }
})

expenses.delete('/expenses/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM expenses WHERE id=$1', [req.params.id])
    if (!rowCount) return res.status(404).json({ error: 'not found' })
    res.status(204).end()
  } catch (err) { next(err) }
})

expenses.get('/categories', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM categories ORDER BY name')
    res.json(rows)
  } catch (err) { next(err) }
})
