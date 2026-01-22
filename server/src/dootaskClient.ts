import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from 'pino';

export interface RequestResult<T = unknown> {
  data?: T;
  error?: string;
  ret?: number;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class DooTaskToolsClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly baseUrl: string,
    private readonly timeout: number,
    private readonly logger: Logger,
  ) {
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'User-Agent': 'DooTask-MCP/0.1.0',
      },
    });
  }

  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    params: Record<string, unknown> = {},
    token?: string,
    host?: string,
  ): Promise<RequestResult<T>> {
    if (!token) {
      return {
        error: 'Missing Authorization token. Please set the "Authorization: Bearer <token>" header when connecting to the MCP server.',
      };
    }

    const url = this.normalizePath(path);
    const config: AxiosRequestConfig = {
      method,
      url,
      headers: {
        Token: token,
        ...(host ? { Host: host } : {}),
      },
    };

    try {
      if (method === 'GET' || method === 'DELETE') {
        config.url = this.appendQuery(url, params);
      } else {
        config.data = params;
        config.headers = {
          ...config.headers,
          'Content-Type': 'application/json',
        };
      }

      const response = await this.http.request(config);
      const payload = response.data ?? {};

      if (payload.ret !== 1) {
        const errorMessage = payload.msg || `Request failed with code ${payload.ret ?? 'unknown'}`;
        return { error: errorMessage, ret: payload.ret, data: payload.data as T };
      }

      return { data: payload.data as T, ret: payload.ret };
    } catch (error) {
      const message = this.resolveErrorMessage(error);
      this.logger.error({ err: error, path, method }, 'DoTaskToolsClient request failed');
      return { error: message };
    }
  }

  private normalizePath(path: string): string {
    const trimmed = path.replace(/^\/+/, '');
    if (trimmed.startsWith('api/')) {
      return `/${trimmed}`;
    }
    return `/api/${trimmed}`;
  }

  private appendQuery(url: string, params: Record<string, unknown>): string {
    const query = this.toQueryString(params);
    if (!query) {
      return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${query}`;
  }

  private toQueryString(params: Record<string, unknown>): string {
    const segments: string[] = [];

    const append = (key: string, value: unknown) => {
      if (value === undefined || value === null) return;

      if (typeof value === 'boolean') {
        segments.push(`${encodeURIComponent(key)}=${value ? 1 : 0}`);
        return;
      }

      if (typeof value === 'string') {
        if (value.length > 0) {
          segments.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
        return;
      }

      if (typeof value === 'number') {
        if (!Number.isNaN(value)) {
          segments.push(`${encodeURIComponent(key)}=${value}`);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => {
          append(`${key}[]`, item);
        });
        return;
      }

      segments.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    };

    Object.entries(params).forEach(([key, value]) => append(key, value));

    return segments.join('&');
  }

  private resolveErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error';

    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      if ('response' in error && error.response && typeof error.response === 'object') {
        const response = error.response as { status?: number; statusText?: string; data?: unknown };
        const statusPart = response.status ? `HTTP ${response.status}` : 'HTTP request failed';
        if (response.data && typeof response.data === 'object' && response.data !== null && 'msg' in response.data) {
          const dataMsg = (response.data as { msg?: string }).msg;
          if (dataMsg) {
            return `${statusPart}: ${dataMsg}`;
          }
        }

        return `${statusPart}${response.statusText ? `: ${response.statusText}` : ''}`;
      }

      return error.message || 'Unknown error';
    }

    return String(error);
  }
}
