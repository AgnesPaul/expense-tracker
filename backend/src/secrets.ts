import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { config } from './config'

/**
 * Fetches the database credentials from Secrets Manager and puts them into the
 * environment, where node-postgres picks them up.
 *
 * The point is what this removes: with DB_SECRET_ID set, the password exists
 * nowhere on this machine — not in a file, not in an image, not in the compose
 * config. It is fetched over TLS at startup using the instance's IAM role, held
 * in memory, and never written down.
 *
 * Rotating the password in Secrets Manager then needs no redeploy, only a
 * restart.
 *
 * No-ops when DB_SECRET_ID is unset, so local development still works from
 * plain environment variables.
 */
export async function loadDbCredentials(): Promise<void> {
  if (!config.dbSecretId) return

  const client = new SecretsManagerClient({ region: config.awsRegion })
  const res = await client.send(new GetSecretValueCommand({ SecretId: config.dbSecretId }))

  if (!res.SecretString) throw new Error(`secret ${config.dbSecretId} has no string value`)

  const secret = JSON.parse(res.SecretString) as Record<string, string | number>

  // An RDS-managed secret (rds!db-...) contains ONLY username and password.
  // Secrets you create by hand may also carry host/port/dbname. Anything
  // absent here keeps whatever the environment already set — which is why
  // PGHOST still has to be configured separately.
  if (secret.username) process.env.PGUSER = String(secret.username)
  if (secret.password) process.env.PGPASSWORD = String(secret.password)
  if (secret.host) process.env.PGHOST = String(secret.host)
  if (secret.port) process.env.PGPORT = String(secret.port)
  if (secret.dbname) process.env.PGDATABASE = String(secret.dbname)

  console.log(`[secrets] loaded credentials for "${process.env.PGUSER}" from ${config.dbSecretId}`)
}
