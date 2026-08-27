import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://crypto_admin:secret_db_password@localhost:5432/crypto_platform',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev_insecure_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  supportedPairs: (
    process.env.SUPPORTED_PAIRS ||
    'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,TRXUSDT,DOTUSDT,LTCUSDT,LINKUSDT,AVAXUSDT,ATOMUSDT,UNIUSDT,ETCUSDT,XLMUSDT,BCHUSDT,NEARUSDT,FILUSDT,ICPUSDT'
  ).split(','),
  binanceWsUrl: process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/stream',
  startingFiatBalance: parseFloat(process.env.STARTING_FIAT_BALANCE || '0'),
  fiatSymbol: process.env.FIAT_SYMBOL || 'USDT',
};
