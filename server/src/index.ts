import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { DooTaskToolsClient } from './dootaskClient';
import { DooTaskMcpServer } from './dootaskMcpServer';

const DEFAULT_FILE = 'index.html';

const GUIDE_PATH_CANDIDATES = [
  path.resolve(__dirname, '../guide/dist'),
  path.resolve(__dirname, '../../guide/dist'),
  path.resolve(process.cwd(), '../guide/dist'),
  path.resolve(process.cwd(), './guide/dist'),
];

const contentTypeMap: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return contentTypeMap[ext] || 'application/octet-stream';
}

function resolveGuideRoot(): string | null {
  for (const candidate of GUIDE_PATH_CANDIDATES) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

function findStaticFile(requestPath: string): string | null {
  const guideRoot = resolveGuideRoot();
  if (!guideRoot) {
    return null;
  }

  const relativePath = requestPath === '/' || requestPath === ''
    ? DEFAULT_FILE
    : requestPath.replace(/^\/+/, '');
  const candidatePath = path.join(guideRoot, relativePath);

  if (!candidatePath.startsWith(guideRoot)) {
    return null;
  }

  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return candidatePath;
  }

  const fallbackPath = path.join(guideRoot, DEFAULT_FILE);
  return fs.existsSync(fallbackPath) ? fallbackPath : null;
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info({
    baseUrl: config.baseUrl,
    port: config.port,
    timeout: config.requestTimeout,
  }, 'Starting DooTask MCP server');

  const client = new DooTaskToolsClient(config.baseUrl, config.requestTimeout, logger);
  const server = new DooTaskMcpServer(client, logger);
  const webServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    const filePath = findStaticFile(pathname);

    if (!filePath) {
      logger.warn({ path: pathname, candidates: GUIDE_PATH_CANDIDATES }, 'Guide assets not found');
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Guide not available. Please build the front-end assets.');
      return;
    }

    try {
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': resolveContentType(filePath) });
      stream.pipe(res);
      stream.on('error', (error) => {
        logger.error({ err: error, path: filePath }, 'Failed to read guide asset');
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Failed to load guide asset.');
      });
    } catch (error) {
      logger.error({ err: error, path: filePath }, 'Unexpected error serving guide asset');
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Failed to load guide asset.');
    }
  });

  await server.start(config.port);
  logger.info(`MCP server is listening on http://0.0.0.0:${config.port}/mcp`);
  webServer.listen(config.healthPort, '0.0.0.0', () => {
    logger.info(`Guide page ready at http://0.0.0.0:${config.healthPort}/ (health: /healthz)`);
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Received shutdown signal, stopping MCP server');
    try {
      webServer.close();
      await server.stop();
      logger.info('MCP server stopped');
    } catch (error) {
      logger.error({ err: error }, 'Failed to stop MCP server gracefully');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start DooTask MCP server:', error);
  process.exit(1);
});
