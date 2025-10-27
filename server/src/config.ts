import { config as loadEnv } from 'dotenv';

loadEnv();

export interface AppConfig {
  baseUrl: string;
  port: number;
  healthPort: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  requestTimeout: number;
}

const DEFAULT_PORT = 7000;
const DEFAULT_HEALTH_PORT = 7001;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_BASE_URL = 'http://nginx';
const DEFAULT_LOG_LEVEL = 'info';

export function loadConfig(): AppConfig {
  const baseUrl = DEFAULT_BASE_URL;
  const rawLogLevel = DEFAULT_LOG_LEVEL;
  const allowedLogLevels = new Set(['debug', 'info', 'warn', 'error']);
  const logLevel = (allowedLogLevels.has(rawLogLevel) ? rawLogLevel : 'info') as AppConfig['logLevel'];

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    port: DEFAULT_PORT,
    healthPort: DEFAULT_HEALTH_PORT,
    requestTimeout: DEFAULT_TIMEOUT,
    logLevel,
  };
}
