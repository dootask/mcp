import pino from 'pino';

export function createLogger(level: pino.LevelWithSilent = 'info') {
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
