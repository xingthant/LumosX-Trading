export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://crypto_admin:secret_db_password@localhost:5432/crypto_platform',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
};
