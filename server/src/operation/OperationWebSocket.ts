import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Logger } from 'pino';
import { ConnectionManager } from './ConnectionManager';
import axios from 'axios';

interface OperationWebSocketOptions {
  server: HttpServer;
  path: string;
  logger: Logger;
  baseUrl: string;
}

export class OperationWebSocket {
  private wss: WebSocketServer;
  readonly connectionManager: ConnectionManager;
  private readonly logger: Logger;
  private readonly baseUrl: string;

  constructor(options: OperationWebSocketOptions) {
    this.logger = options.logger;
    this.baseUrl = options.baseUrl;
    this.connectionManager = new ConnectionManager(options.logger);

    this.wss = new WebSocketServer({
      server: options.server,
      path: options.path,
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      this.logger.error({ error }, 'WebSocket server error');
    });

    this.logger.info({ path: options.path }, 'Operation WebSocket server started');
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      this.logger.warn('WebSocket connection rejected: missing token');
      ws.close(4001, '缺少认证 token');
      return;
    }

    // 验证 token
    const user = await this.verifyToken(token);
    if (!user) {
      this.logger.warn('WebSocket connection rejected: invalid token');
      ws.close(4002, '认证失败');
      return;
    }

    // 生成 session ID 并注册连接
    const sessionId = this.connectionManager.generateSessionId();
    this.connectionManager.register(sessionId, ws, user.userid, token);

    // 发送连接成功消息
    ws.send(JSON.stringify({
      type: 'connected',
      session_id: sessionId,
      expires_at: Date.now() + 3600000, // 1 小时
    }));

    // 监听消息
    ws.on('message', (data) => {
      this.handleMessage(sessionId, data);
    });
  }

  private handleMessage(sessionId: string, data: Buffer | ArrayBuffer | Buffer[]): void {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'response') {
        this.connectionManager.handleResponse(msg);
      } else if (msg.type === 'ping') {
        // 心跳响应
        const conn = this.connectionManager.getConnection(sessionId);
        if (conn?.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(JSON.stringify({ type: 'pong' }));
        }
      } else {
        this.logger.warn({ sessionId, msgType: msg.type }, 'Unknown message type');
      }
    } catch (error) {
      this.logger.error({ sessionId, error }, 'Failed to parse WebSocket message');
    }
  }

  private async verifyToken(token: string): Promise<{ userid: number } | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/users/info`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        timeout: 10000,
      });

      if (response.data?.ret === 1 && response.data?.data?.userid) {
        return { userid: response.data.data.userid };
      }
      return null;
    } catch (error) {
      this.logger.error({ error }, 'Token verification failed');
      return null;
    }
  }

  getStats(): { connectionCount: number; pendingRequestCount: number } {
    return this.connectionManager.getStats();
  }
}
