import { Pool } from 'pg'
import { config } from './config'

// A single shared pool. Note there is no local state beyond this connection —
// the API stays stateless so two instances can sit behind a load balancer.
// When no connectionString is given, node-postgres reads PGHOST, PGUSER,
// PGPASSWORD, PGDATABASE and PGPORT from the environment by itself.
export const pool = new Pool({
  ...(config.databaseUrl ? { connectionString: config.databaseUrl } : {}),
  max: 10,
  idleTimeoutMillis: 30_000,
  // RDS requires TLS but presents an Amazon CA; Phase 4 flips this on.
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
})

pool.on('error', (err) => console.error('[db] idle client error', err))

export async function ping(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch (err) {
    console.error('[db] ping failed', err)
    return false
  }
}
