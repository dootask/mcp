import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { DooTaskToolsClient } from './dootaskClient';
import { DooTaskMcpServer } from './dootaskMcpServer';

const DEFAULT_GUIDE_FILE = 'index.html';

const GUIDE_PATH_CANDIDATES = [
  path.resolve(__dirname, '../guide/dist'),
  path.resolve(__dirname, '../../guide/dist'),
  path.resolve(process.cwd(), '../guide/dist'),
  path.resolve(process.cwd(), './guide/dist'),
];

const CONTENT_TYPE_MAP: Record<string, string> = {
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
  return CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
}

function resolveGuideRoot(): string | null {
  for (const candidate of GUIDE_PATH_CANDIDATES) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

function findGuideAsset(requestPath: string): string | null {
  const guideRoot = resolveGuideRoot();
  if (!guideRoot) return null;

  const relativePath = requestPath === '/' || requestPath === ''
    ? DEFAULT_GUIDE_FILE
    : requestPath.replace(/^\/+/, '');
  const resolvedPath = path.join(guideRoot, relativePath);

  if (!resolvedPath.startsWith(guideRoot)) {
    return null;
  }

  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    return resolvedPath;
  }

  const fallback = path.join(guideRoot, DEFAULT_GUIDE_FILE);
  return fs.existsSync(fallback) ? fallback : null;
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info({
    baseUrl: config.baseUrl,
    port: config.port,
    healthPort: config.healthPort,
    timeout: config.requestTimeout,
  }, 'Starting DooTask MCP server');

  const client = new DooTaskToolsClient(config.baseUrl, config.requestTimeout, logger);
  const mcpServer = new DooTaskMcpServer(client, logger);

  const guideServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/healthz' || pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    const assetPath = findGuideAsset(pathname);
    if (!assetPath) {
      logger.warn({ path: pathname }, 'Guide asset not found');
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Guide asset not found. Please build the guide application.');
      return;
    }

    const stream = fs.createReadStream(assetPath);
    res.writeHead(200, { 'Content-Type': resolveContentType(assetPath) });
    stream.pipe(res);
    stream.on('error', (error) => {
      logger.error({ err: error, path: assetPath }, 'Failed to read guide asset');
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Failed to load guide asset.');
    });
  });

  await mcpServer.start(config.port);
  logger.info(`MCP server is listening on http://0.0.0.0:${config.port}/mcp`);

  guideServer.listen(config.healthPort, '0.0.0.0', () => {
    logger.info(`Guide server ready at http://0.0.0.0:${config.healthPort}/`);
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Received shutdown signal');
    try {
      guideServer.close();
      await mcpServer.stop();
      logger.info('Servers stopped gracefully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to stop servers gracefully');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
