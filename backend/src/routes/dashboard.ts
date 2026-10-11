import { Router } from 'express'
import { pool } from '../db'

export const dashboard = Router()

// GET /dashboard?month=YYYY-MM  → month total, per-category split, recent rows
dashboard.get('/dashboard', async (req, res, next) => {
  try {
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
      ? `${req.query.month}-01`
      : new Date().toISOString().slice(0, 8) + '01'

    const scope = `date_trunc('month', e.spent_on) = date_trunc('month', $1::date)`

    const [total, byCategory, recent] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(e.amount),0)::float8 AS total,
                         COUNT(*)::int AS count
                  FROM expenses e WHERE ${scope}`, [month]),
      pool.query(`SELECT c.name AS category, SUM(e.amount)::float8 AS total
                  FROM expenses e JOIN categories c ON c.id = e.category_id
                  WHERE ${scope}
                  GROUP BY c.name ORDER BY total DESC`, [month]),
      pool.query(`SELECT e.id, e.amount::float8 AS amount, e.note,
                         to_char(e.spent_on,'YYYY-MM-DD') AS spent_on, c.name AS category
                  FROM expenses e JOIN categories c ON c.id = e.category_id
                  ORDER BY e.spent_on DESC, e.id DESC LIMIT 5`),
    ])

    res.json({
      month: month.slice(0, 7),
      total: total.rows[0].total,
      count: total.rows[0].count,
      by_category: byCategory.rows,
      recent: recent.rows,
    })
  } catch (err) { next(err) }
})
