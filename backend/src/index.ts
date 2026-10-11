import express from 'express'
import cors from 'cors'
import { ZodError } from 'zod'
import { config } from './config'
import { ping, pool } from './db'
import { expenses } from './routes/expenses'
import { dashboard } from './routes/dashboard'
import { receipts } from './routes/receipts'

const app = express()
app.use(express.json())

// CORS matters only while developing locally against the Vite dev server.
// In Phase 6 CloudFront serves the UI and proxies /api/* to the ALB, so the
// browser sees a single origin and CORS stops existing as a concept.
app.use(cors())

app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.originalUrl}`)
  next()
})

// The ALB target group polls this. If it stops returning 2xx, this instance is
// pulled out of rotation. Phase 7 exercises exactly that.
app.get('/health', async (_req, res) => {
  if (config.forceUnhealthy) {
    console.error('[health] FORCE_UNHEALTHY is set — reporting unhealthy on purpose')
    return res.status(503).json({ status: 'forced-unhealthy' })
  }
  const db = await ping()
  res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db })
})

app.use('/api', expenses, dashboard, receipts)

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'invalid request', details: err.flatten() })
  }
  console.error('[error]', err)
  res.status(500).json({ error: 'internal error' })
})

const server = app.listen(config.port, () => {
  console.log(`[boot] listening on :${config.port}`)
})

// When an Auto Scaling Group terminates this instance, it gets SIGTERM first.
// Finishing in-flight requests before exiting is what makes a deploy seamless.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[shutdown] ${signal} received, draining`)
    server.close(() => pool.end().then(() => process.exit(0)))
    setTimeout(() => process.exit(1), 10_000).unref()
  })
}
