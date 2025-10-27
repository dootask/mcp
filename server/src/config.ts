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
const DEFAULT_HEALTH_OFFSET = 1;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_BASE_URL = 'http://nginx';

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const port = Number.parseInt(value, 10);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

function parseTimeout(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const timeout = Number.parseInt(value, 10);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : fallback;
}

export function loadConfig(): AppConfig {
  const baseUrl = process.env.API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const rawLogLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const allowedLogLevels = new Set(['debug', 'info', 'warn', 'error']);
  const logLevel = (allowedLogLevels.has(rawLogLevel) ? rawLogLevel : 'info') as AppConfig['logLevel'];

  const port = parsePort(process.env.MCP_PORT, DEFAULT_PORT);
  const healthPort = parsePort(process.env.HEALTH_PORT, port + DEFAULT_HEALTH_OFFSET);

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    port,
    healthPort,
    logLevel,
    requestTimeout: parseTimeout(process.env.REQUEST_TIMEOUT, DEFAULT_TIMEOUT),
  };
}
