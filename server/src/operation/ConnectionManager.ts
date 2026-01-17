import { v4 as uuidv4 } from 'uuid';
import type { WebSocket } from 'ws';
import type { Logger } from 'pino';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface ConnectionInfo {
  ws: WebSocket;
  userId: number;
  token: string;
  createdAt: number;
}

export class ConnectionManager {
  private connections = new Map<string, ConnectionInfo>();
  private pendingRequests = new Map<string, PendingRequest>();
  private readonly requestTimeout: number;

  constructor(
    private readonly logger: Logger,
    requestTimeout = 30000,
  ) {
    this.requestTimeout = requestTimeout;
  }

  /**
   * 注册新连接
   */
  register(sessionId: string, ws: WebSocket, userId: number, token: string): void {
    this.connections.set(sessionId, {
      ws,
      userId,
      token,
      createdAt: Date.now(),
    });

    ws.on('close', () => {
      this.logger.info({ sessionId }, 'WebSocket connection closed');
      this.connections.delete(sessionId);
    });

    ws.on('error', (error) => {
      this.logger.error({ sessionId, error }, 'WebSocket error');
    });

    this.logger.info({ sessionId, userId }, 'WebSocket connection registered');
  }

  /**
   * 检查连接是否存在
   */
  hasConnection(sessionId: string): boolean {
    return this.connections.has(sessionId);
  }

  /**
   * 获取连接信息
   */
  getConnection(sessionId: string): ConnectionInfo | undefined {
    return this.connections.get(sessionId);
  }

  /**
   * 发送请求到前端并等待响应
   */
  async sendRequest(sessionId: string, action: string, payload: unknown): Promise<unknown> {
    const conn = this.connections.get(sessionId);
    if (!conn) {
      throw new Error('客户端未连接');
    }

    const { ws } = conn;
    if (ws.readyState !== ws.OPEN) {
      throw new Error('WebSocket 连接已断开');
    }

    const requestId = uuidv4();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('请求超时'));
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      const message = JSON.stringify({
        id: requestId,
        type: 'request',
        action,
        payload,
      });

      ws.send(message, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pendingRequests.delete(requestId);
          reject(new Error(`发送消息失败: ${error.message}`));
        }
      });

      this.logger.debug({ sessionId, requestId, action }, 'Request sent to client');
    });
  }

  /**
   * 处理来自前端的响应
   */
  handleResponse(msg: { id: string; success: boolean; data?: unknown; error?: string }): void {
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) {
      this.logger.warn({ requestId: msg.id }, 'Received response for unknown request');
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(msg.id);

    if (msg.success) {
      pending.resolve(msg.data);
    } else {
      pending.reject(new Error(msg.error || '操作失败'));
    }

    this.logger.debug({ requestId: msg.id, success: msg.success }, 'Response handled');
  }

  /**
   * 生成新的 session ID
   */
  generateSessionId(): string {
    return uuidv4();
  }

  /**
   * 获取连接统计
   */
  getStats(): { connectionCount: number; pendingRequestCount: number } {
    return {
      connectionCount: this.connections.size,
      pendingRequestCount: this.pendingRequests.size,
    };
  }
}
