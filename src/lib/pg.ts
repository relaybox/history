import { Pool } from 'pg';
import { getLogger } from '../util/logger.util';

const logger = getLogger(`pg-pool`);

const RDS_ROOT_CERTIFICATE = process.env.RDS_ROOT_CERTIFICATE || '';
const DB_PROXY_ENABLED = process.env.DB_PROXY_ENABLED === 'true';
const DB_TLS_DISABLED = process.env.DB_TLS_DISABLED === 'true';

let pgPool: Pool;

const ssl = {
  rejectUnauthorized: true,
  ...(!DB_PROXY_ENABLED && { ca: RDS_ROOT_CERTIFICATE })
};

export function getPgPool(): Pool {
  if (pgPool) {
    return pgPool;
  }

  logger.info('Creating pg pool', {
    host: process.env.DB_HOST,
    name: process.env.DB_NAME
  });

  pgPool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    max: Number(process.env.DB_MAX_CONNECTIONS),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS),
    connectionTimeoutMillis: 2000,
    ...(!DB_TLS_DISABLED && { ssl })
  });

  return pgPool;
}

process.on('SIGINT', async () => {
  if (pgPool) {
    await pgPool.end();
    logger.info('PG pool ended through app termination');
  }

  process.exit(0);
});
