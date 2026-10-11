// Applies migrations/*.sql in filename order, recording what has run.
// You will run this by hand against RDS in Phase 4 — that is the point of
// having it as a script rather than relying on Postgres' initdb hook.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pool } from './db'

const dir = join(__dirname, '..', 'migrations')

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)

  const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')
  const done = new Set(rows.map((r) => r.filename))
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (done.has(file)) {
      console.log(`[migrate] skip ${file}`)
      continue
    }
    const sql = readFileSync(join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`[migrate] applied ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
  await pool.end()
  console.log('[migrate] done')
}

main().catch((err) => {
  console.error('[migrate] failed', err)
  process.exit(1)
})
