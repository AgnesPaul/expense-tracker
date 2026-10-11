// Every setting comes from the environment. Nothing is hardcoded.
// This is what lets the identical Docker image run on your laptop (Phase 1),
// on EC2 against local Postgres (Phase 3), and on EC2 against RDS (Phase 4)
// with no code change at all.
export const config = {
  port: Number(process.env.PORT ?? 3000),

  // Two ways to reach the database:
  //   DATABASE_URL  — one connection string (convenient locally)
  //   PGHOST/PGUSER/PGPASSWORD/PGDATABASE — discrete values
  // The discrete form exists because a generated password can contain
  // characters that are structural in a URL (# truncates it, @ splits it,
  // / ends the host). Passing them separately sidesteps all escaping.
  databaseUrl: process.env.DATABASE_URL ?? '',
  pgHost: process.env.PGHOST ?? '',

  // Phase 4: when set, credentials are pulled from Secrets Manager at boot
  // instead of being baked into DATABASE_URL.
  dbSecretId: process.env.DB_SECRET_ID ?? '',

  // Phase 5
  receiptsBucket: process.env.RECEIPTS_BUCKET ?? '',
  awsRegion: process.env.AWS_REGION ?? 'ap-south-1',

  // Phase 7: flip this to make /health fail, so you can watch the ALB
  // drain this target out of the target group. Set and restart, don't redeploy.
  forceUnhealthy: process.env.FORCE_UNHEALTHY === 'true',
}

if (!config.databaseUrl && !config.pgHost && !config.dbSecretId) {
  throw new Error('Set DATABASE_URL, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE')
}
