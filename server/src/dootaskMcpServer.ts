/* eslint-disable @typescript-eslint/no-explicit-any */

import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { IncomingMessage } from 'node:http';
import { DooTaskToolsClient, RequestResult } from './dootaskClient';
import TurndownService from 'turndown';
import { marked } from 'marked';
import axios from 'axios';
import { OCR_SUPPORTED_FORMATS } from './ocrService';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// 内部 OCR API 地址
const OCR_API_URL = process.env.OCR_API_URL || 'http://localhost:7001/ocr';

export class DooTaskMcpServer {
  readonly mcp: FastMCP;
  private readonly turndownService: TurndownService;

  constructor(
    private readonly client: DooTaskToolsClient,
    private readonly logger: Logger,
  ) {
    this.mcp = new FastMCP({
      name: 'DooTask MCP Server',
      version: '0.1.0',
      authenticate: this.authenticateRequest.bind(this),
    });

    // 初始化 HTML 转 Markdown 工具
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      preformattedCode: true,
    });

    this.setupTools();
  }

  async start(port: number): Promise<void> {
    await this.mcp.start({
      transportType: 'httpStream',
      httpStream: {
        port,
        host: '0.0.0.0',
      },
    });
  }

  async stop(): Promise<void> {
    if (this.mcp && typeof this.mcp.stop === 'function') {
      await this.mcp.stop();
    }
  }

  /**
   * 注册前端操作工具
   */
  registerOperationTools(tools: Record<string, {
    name: string;
    description: string;
    parameters: any;
    execute: (params: any) => Promise<any>;
  }>): void {
    for (const tool of Object.values(tools)) {
      this.mcp.addTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        execute: tool.execute,
      });
      this.logger.info({ toolName: tool.name }, 'Registered operation tool');
    }
  }

  private async request(
    method: HttpMethod,
    path: string,
    data: Record<string, unknown>,
    context: any,
  ): Promise<RequestResult> {
    const token = this.extractToken(context);
    const host = this.extractHost(context);
    if (!token) {
      this.logger.warn({ tool: path }, 'Missing Authorization token for MCP request');
      return {
        error:
          'Authorization header or URL token missing. Please configure your MCP client with "Authorization: Bearer <DooTaskToken>" or add "?token=<DooTaskToken>" to the URL.',
      };
    }

    return this.client.request(method, path, data, token, host);
  }

  private async authenticateRequest(request: IncomingMessage): Promise<Record<string, unknown>> {
    const headers = this.normalizeHeaders(request.headers);

    this.logger.debug(
      {
        headerPreview: headers ? this.previewHeaders(headers) : undefined,
        url: request.url,
      },
      'Authenticating incoming HTTP request',
    );

    const token = (headers ? this.findAuthorization(headers) : undefined) ?? this.findTokenFromUrl(request.url);
    if (!token) {
      throw new Error(
        'Authorization header or URL token missing. Please configure your MCP client with "Authorization: Bearer <DooTaskToken>" or add "?token=<DooTaskToken>" to the URL.',
      );
    }

    return {
      headers: headers ?? {},
      token,
    };
  }

  private extractToken(context: any): string | undefined {
    const sessionToken = this.readSessionToken(context?.session);
    const headerSources = this.gatherHeaderSources(context);

    this.logger.debug(
      {
        sessionToken: sessionToken ? this.previewAuthorizationValue(sessionToken) : undefined,
        headerSources: headerSources.map((headers) => this.previewHeaders(headers)),
      },
      'Inspecting incoming headers for authorization token',
    );

    if (sessionToken) {
      return sessionToken;
    }

    for (const headers of headerSources) {
      const header = this.findAuthorization(headers);
      if (header) {
        return header;
      }
    }

    const urlToken = this.findTokenFromUrl(this.findContextUrl(context));
    if (urlToken) {
      return urlToken;
    }

    return undefined;
  }

  private extractHost(context: any): string | undefined {
    const directSources = [
      context,
      context?.metadata,
      context?.request,
      context?.session,
      context?.session?.metadata,
    ];

    for (const source of directSources) {
      const host = this.readHostRecord(source);
      if (host) {
        return host;
      }
    }

    const headerSources = this.gatherHeaderSources(context);
    this.logger.debug(
      {
        headerSources: headerSources.map((headers) => this.previewHeaders(headers)),
      },
      'Inspecting incoming headers for host',
    );

    for (const headers of headerSources) {
      const host = this.findHostHeader(headers);
      if (host) {
        return host;
      }
    }

    return undefined;
  }

  private findAuthorization(headers: Record<string, string>): string | undefined {
    const normalizedEntries = Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value] as const);
    const authEntry = normalizedEntries.find(([key]) => key === 'authorization' || key === 'token');
    if (!authEntry) {
      return undefined;
    }

    const value = authEntry[1];
    if (!value) {
      return undefined;
    }

    if (value.startsWith('Bearer ')) {
      return value.slice('Bearer '.length).trim();
    }

    return value.trim();
  }

  private gatherHeaderSources(context: any): Record<string, string>[] {
    return [
      this.normalizeHeaders(context?.metadata?.headers),
      this.normalizeHeaders(context?.session?.metadata?.headers),
      this.normalizeHeaders(context?.headers),
      this.normalizeHeaders(context?.request?.headers),
      this.normalizeHeaders(context?.session?.headers),
    ].filter(Boolean) as Record<string, string>[];
  }

  private findContextUrl(context: any): string | undefined {
    if (!context) {
      return undefined;
    }
    const candidates = [
      context?.url,
      context?.request?.url,
      context?.metadata?.url,
      context?.session?.url,
      context?.session?.metadata?.url,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    return undefined;
  }

  private readHostRecord(record: Record<string, unknown> | undefined): string | undefined {
    if (!record || typeof record !== 'object') {
      return undefined;
    }

    const directHost = this.extractStringValue(record['host']) ?? this.extractStringValue(record['hostname']);
    if (directHost) {
      return directHost;
    }

    const headers = this.normalizeHeaders(record['headers']);
    if (headers) {
      return this.findHostHeader(headers);
    }

    return undefined;
  }

  private extractStringValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private findHostHeader(headers: Record<string, string>): string | undefined {
    const candidates = ['host', 'x-forwarded-host', 'x-forwarded-server', 'x-original-host'];
    for (const candidate of candidates) {
      const value = this.findHeaderIgnoreCase(headers, candidate);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private findHeaderIgnoreCase(headers: Record<string, string>, key: string): string | undefined {
    const lowerKey = key.toLowerCase();
    for (const [headerKey, headerValue] of Object.entries(headers)) {
      if (headerKey.toLowerCase() === lowerKey) {
        const trimmed = headerValue.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return undefined;
  }

  private readSessionToken(session: unknown): string | undefined {
    if (!session || typeof session !== 'object') {
      return undefined;
    }

    const record = session as Record<string, unknown>;
    const directToken = record.token;
    if (typeof directToken === 'string' && directToken.trim()) {
      return directToken.trim();
    }

    const headers = this.normalizeHeaders(record.headers);
    if (headers) {
      return this.findAuthorization(headers);
    }

    return undefined;
  }

  private previewHeaders(headers: Record<string, string>): Record<string, string> {
    const preview: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const normalizedKey = key.toLowerCase();
      preview[normalizedKey] =
        normalizedKey === 'authorization' || normalizedKey === 'token'
          ? this.previewAuthorizationValue(value)
          : value;
    }
    return preview;
  }

  private previewAuthorizationValue(rawValue: string): string {
    const value = rawValue.trim();
    if (!value) {
      return value;
    }

    if (value.toLowerCase().startsWith('bearer ')) {
      const token = value.slice('Bearer '.length).trim();
      return `Bearer ${this.compactToken(token)}`;
    }

    return this.compactToken(value);
  }

  private compactToken(token: string): string {
    if (token.length <= 12) {
      return token;
    }

    const prefix = token.slice(0, 6);
    const suffix = token.slice(-4);
    return `${prefix}...${suffix}`;
  }

  private normalizeHeaders(headers: unknown): Record<string, string> | undefined {
    if (!headers || typeof headers !== 'object') {
      return undefined;
    }

    const asIterable = headers as { forEach?: unknown };
    if (typeof asIterable.forEach === 'function') {
      const result: Record<string, string> = {};
      (asIterable.forEach as (callback: (value: unknown, key: string) => void) => void)((value, key) => {
        if (typeof value === 'string' && value.trim()) {
          result[key] = value;
        }
      });
      return Object.keys(result).length > 0 ? result : undefined;
    }

    const result: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(headers as Record<string, unknown>)) {
      if (rawValue === undefined || rawValue === null) {
        continue;
      }

      if (Array.isArray(rawValue)) {
        const first = rawValue.find((item) => typeof item === 'string' && item.trim());
        if (typeof first === 'string') {
          result[key] = first;
        }
        continue;
      }

      if (typeof rawValue === 'string' && rawValue.trim()) {
        result[key] = rawValue;
        continue;
      }

      if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
        result[key] = String(rawValue);
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private findTokenFromUrl(url: string | undefined): string | undefined {
    if (!url) {
      return undefined;
    }

    try {
      const parsed = new URL(url, 'http://localhost');
      const token = parsed.searchParams.get('token') ?? parsed.searchParams.get('access_token');
      return token && token.trim() ? token.trim() : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * HTML 转 Markdown
   */
  private htmlToMarkdown(html: string): string {
    if (!html) {
      return '';
    }
    if (typeof html !== 'string') {
      this.logger.warn(`HTML to Markdown: expected string, got ${typeof html}`);
      return '';
    }
    try {
      const markdown = this.turndownService.turndown(html);
      return markdown.trim();
    } catch (error: any) {
      this.logger.error(`HTML to Markdown conversion failed: ${error.message}`, { html: html.substring(0, 100) });
      // 返回清理后的纯文本作为降级方案
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  /**
   * Markdown 转 HTML
   */
  private markdownToHtml(markdown: string): string {
    if (!markdown) {
      return '';
    }
    if (typeof markdown !== 'string') {
      this.logger.warn(`Markdown to HTML: expected string, got ${typeof markdown}`);
      return '';
    }
    try {
      const html = marked.parse(markdown, { async: false }) as string;
      return html;
    } catch (error: any) {
      this.logger.error(`Markdown to HTML conversion failed: ${error.message}`, { markdown: markdown.substring(0, 100) });
      // 返回原始 markdown 作为降级方案
      return markdown.replace(/\n/g, '<br>');
    }
  }

  /**
   * 获取 DooTask 文件的下载 URL
   */
  private async getFileContentUrl(
    fileId: number | string,
    context: any,
  ): Promise<string> {
    const fileResult = await this.request('GET', 'file/one', {
      id: fileId,
      with_url: 'yes',
    }, context);

    if (fileResult.error) {
      throw new Error(`获取文件失败: ${fileResult.error}`);
    }

    const file = fileResult.data as any;
    if (!file) {
      throw new Error('文件不存在');
    }

    const ext = (file.ext || '').toLowerCase().replace(/^\./, '');
    if (!OCR_SUPPORTED_FORMATS.includes(ext)) {
      throw new Error(`不支持的图片格式: ${ext}，支持格式: ${OCR_SUPPORTED_FORMATS.join(', ')}`);
    }

    const contentUrl = file.content_url || file.path;
    if (!contentUrl) {
      throw new Error('无法获取文件下载地址');
    }

    return contentUrl;
  }

  private setupTools(): void {
    // 用户管理：获取用户基础信息
    this.mcp.addTool({
      name: 'get_users_basic',
      description: 'Batch fetch basic user info (nickname, email, avatar, etc.) for 1-50 users.',
      parameters: z.object({
        userids: z.array(z.number())
          .min(1)
          .max(50)
          .describe('Array of user IDs, min 1, max 50'),
      }),
      execute: async (params, context) => {
        const ids = params.userids;
        const requestData: Record<string, unknown> = {
          userid: ids.length === 1 ? ids[0] : JSON.stringify(ids),
        };

        const result = await this.request('GET', 'users/basic', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const payload = result.data ?? {};
        const rawList = Array.isArray(payload)
          ? payload
          : (Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : []);

        const users = rawList.map((user: any) => ({
          userid: user.userid,
          nickname: user.nickname || '',
          email: user.email || '',
          userimg: user.userimg || '',
          profession: user.profession || '',
          department: user.department || [],
          department_name: user.department_name || '',
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: users.length,
              users: users,
            }, null, 2),
          }],
        };
      },
    });

    // 用户管理：搜索用户
    this.mcp.addTool({
      name: 'search_users',
      description: 'Search users by keyword. Filter by project or dialog scope. Use when specific user IDs are unknown.',
      parameters: z.object({
        keyword: z.string()
          .min(1)
          .describe('Search keyword, supports nickname, email, pinyin'),
        project_id: z.number()
          .optional()
          .describe('Only return members of the specified project'),
        dialog_id: z.number()
          .optional()
          .describe('Only return members of the specified dialog'),
        include_disabled: z.boolean()
          .optional()
          .describe('Include deactivated/departed users'),
        include_bot: z.boolean()
          .optional()
          .describe('Include bot accounts'),
        with_department: z.boolean()
          .optional()
          .describe('Include department info in results'),
        page: z.number()
          .optional()
          .describe('Page number, default 1'),
        pagesize: z.number()
          .optional()
          .describe('Page size, default 20, max 100'),
      }),
      execute: async (params, context) => {
        const page = params.page && params.page > 0 ? params.page : 1;
        const pagesize = params.pagesize && params.pagesize > 0 ? Math.min(params.pagesize, 100) : 20;

        const keys: Record<string, unknown> = {
          key: params.keyword,
        };

        if (params.project_id !== undefined) {
          keys.project_id = params.project_id;
        }
        if (params.dialog_id !== undefined) {
          keys.dialog_id = params.dialog_id;
        }
        if (params.include_disabled) {
          keys.disable = 2;
        }
        if (params.include_bot) {
          keys.bot = 2;
        }

        const requestData: Record<string, unknown> = {
          page,
          pagesize,
          keys,
        };

        if (params.with_department) {
          requestData.with_department = 1;
        }

        const result = await this.request('GET', 'users/search', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const data: any = result.data || {};
        let users: any[] = [];
        let total = 0;
        let perPage = pagesize;
        let currentPage = page;

        if (Array.isArray(data.data)) {
          users = data.data;
          total = data.total ?? users.length;
          perPage = data.per_page ?? perPage;
          currentPage = data.current_page ?? currentPage;
        } else if (Array.isArray(data)) {
          users = data;
          total = users.length;
        }

        const simplified = users.map((user: any) => ({
          userid: user.userid,
          nickname: user.nickname || '',
          email: user.email || '',
          tags: user.tags || [],
          department: user.department_info || user.department || '',
          online: user.online ?? null,
          identity: user.identity || '',
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total,
              page: currentPage,
              pagesize: perPage,
              users: simplified,
            }, null, 2),
          }],
        };
      },
    });

    // 获取任务列表
    this.mcp.addTool({
      name: 'list_tasks',
      description: 'List tasks related to the current user (as owner, collaborator, or follower). Supports filtering by status, project, time range, and search.',
      parameters: z.object({
        status: z.enum(['all', 'completed', 'uncompleted'])
          .optional()
          .describe('Task status filter: all, completed, uncompleted'),
        search: z.string()
          .optional()
          .describe('Search keyword (task ID, name, or description)'),
        time: z.string()
          .optional()
          .describe('Time range: today, week, month, year, or custom e.g. 2025-12-12,2025-12-30'),
        project_id: z.number()
          .optional()
          .describe('Project ID, only return tasks in this project'),
        parent_id: z.number()
          .optional()
          .describe('Parent task ID. >0: get subtasks; -1: main tasks only; omit: all tasks'),
        page: z.number()
          .optional()
          .describe('Page number, default 1'),
        pagesize: z.number()
          .optional()
          .describe('Page size, default 20, max 100'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          page: params.page || 1,
          pagesize: params.pagesize || 20,
        };

        const keys: Record<string, unknown> = {};
        if (params.search) {
          keys.name = params.search;
        }
        if (params.status && params.status !== 'all') {
          keys.status = params.status;
        }
        if (Object.keys(keys).length > 0) {
          requestData.keys = keys;
        }

        if (params.time !== undefined) {
          requestData.time = params.time;
        }
        if (params.project_id !== undefined) {
          requestData.project_id = params.project_id;
        }
        if (params.parent_id !== undefined) {
          requestData.parent_id = params.parent_id;
        }

        const result = await this.request('GET', 'project/task/lists', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const response = result.data as any;
        const tasks = (response?.data ?? []).map((task: any) => ({
          task_id: task.id,
          name: task.name,
          desc: task.desc || '无描述',
          dialog_id: task.dialog_id,
          status: task.complete_at ? '已完成' : '未完成',
          complete_at: task.complete_at || '未完成',
          end_at: task.end_at || '无截止时间',
          project_id: task.project_id,
          project_name: task.project_name || '',
          column_name: task.column_name || '',
          parent_id: task.parent_id,
          owners: task.task_user?.filter((u: any) => u.owner === 1).map((u: any) => ({
            userid: u.userid,
          })) || [],
          sub_num: task.sub_num || 0,
          sub_complete: task.sub_complete || 0,
          percent: task.percent || 0,
          created_at: task.created_at,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: response?.total ?? tasks.length,
              page: response?.current_page ?? (params.page || 1),
              pagesize: response?.per_page ?? (params.pagesize || 20),
              tasks: tasks,
            }, null, 2),
          }],
        };
      },
    });

    // 获取任务详情
    this.mcp.addTool({
      name: 'get_task',
      description: 'Get full task details including description, content, owners, assistants, and tags.',
      parameters: z.object({
        task_id: z.number()
          .min(1)
          .describe('Task ID'),
      }),
      execute: async (params, context) => {
        const taskResult = await this.request('GET', 'project/task/one', {
          task_id: params.task_id,
        }, context);

        if (taskResult.error) {
          throw new Error(taskResult.error);
        }

        const task = taskResult.data as any;

        // 获取任务完整内容
        let fullContent = task?.desc || '无描述';
        try {
          const contentResult = await this.request('GET', 'project/task/content', {
            task_id: params.task_id,
          }, context);
          if (contentResult && contentResult.data) {
            const contentData = contentResult.data as any;
            if (typeof contentData === 'object' && contentData !== null && 'content' in contentData) {
              fullContent = contentData.content;
            } else if (typeof contentData === 'string') {
              fullContent = contentData;
            }
          }
        } catch (error: any) {
          this.logger.warn({ err: error }, 'Failed to get task content');
        }

        // 将 HTML 内容转换为 Markdown
        fullContent = this.htmlToMarkdown(fullContent);

        const taskDetail = {
          task_id: task.id,
          name: task.name,
          desc: task.desc || '无描述',
          dialog_id: task.dialog_id,
          content: fullContent,
          status: task.complete_at ? '已完成' : '未完成',
          complete_at: task.complete_at || '未完成',
          project_id: task.project_id,
          project_name: task.project_name,
          column_id: task.column_id,
          column_name: task.column_name,
          parent_id: task.parent_id,
          start_at: task.start_at || '无开始时间',
          end_at: task.end_at || '无截止时间',
          flow_item_id: task.flow_item_id,
          flow_item_name: task.flow_item_name,
          visibility: task.visibility === 1 ? '公开' : '指定人员',
          owners: task.task_user?.filter((u: any) => u.owner === 1).map((u: any) => ({
            userid: u.userid,
          })) || [],
          assistants: task.task_user?.filter((u: any) => u.owner === 0).map((u: any) => ({
            userid: u.userid,
          })) || [],
          tags: task.task_tag?.map((t: any) => t.name) || [],
          created_at: task.created_at,
          updated_at: task.updated_at,
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(taskDetail, null, 2),
          }],
        };
      },
    });

    // 完成任务
    this.mcp.addTool({
      name: 'complete_task',
      description: 'Mark a task as completed. Parent tasks require all subtasks to be completed first.',
      parameters: z.object({
        task_id: z.number()
          .min(1)
          .describe('Task ID to mark as completed'),
        flow_item_id: z.number()
          .optional()
          .describe('Workflow status ID'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          task_id: params.task_id,
        };

        // 标记完成时始终需要传 complete_at
        requestData.complete_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
        if (params.flow_item_id) {
          requestData.flow_item_id = params.flow_item_id;
        }

        const result = await this.request('POST', 'project/task/update', requestData, context);

        // 处理多结束状态的情况
        if (result.ret === -4005) {
          const flowItems = (result.data as any)?.flow_items || [];
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: '存在多个结束状态，请选择要使用的状态后重新调用此工具，并指定flow_item_id参数',
                task_id: params.task_id,
                flow_items: flowItems,
              }, null, 2),
            }],
          };
        }

        if (result.error) {
          throw new Error(result.error);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: '任务已标记为完成',
              task_id: params.task_id,
              complete_at: (result.data as any).complete_at,
            }, null, 2),
          }],
        };
      },
    });

    // 创建任务
    this.mcp.addTool({
      name: 'create_task',
      description: 'Create a new task in a specified project.',
      parameters: z.object({
        project_id: z.number()
          .min(1)
          .describe('Project ID'),
        name: z.string()
          .min(1)
          .describe('Task name'),
        content: z.string()
          .optional()
          .describe('Task content (Markdown format)'),
        owner: z.array(z.number())
          .optional()
          .describe('Array of owner user IDs'),
        assist: z.array(z.number())
          .optional()
          .describe('Array of assistant user IDs'),
        column_id: z.number()
          .optional()
          .describe('Kanban column ID'),
        start_at: z.string()
          .optional()
          .describe('Start time, format: YYYY-MM-DD HH:mm:ss'),
        end_at: z.string()
          .optional()
          .describe('End time, format: YYYY-MM-DD HH:mm:ss'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          project_id: params.project_id,
          name: params.name,
        };

        if (params.content) requestData.content = this.markdownToHtml(params.content);
        if (params.owner) requestData.owner = params.owner;
        if (params.assist) requestData.assist = params.assist;
        if (params.column_id) requestData.column_id = params.column_id;
        if (params.start_at) requestData.start_at = params.start_at;
        if (params.end_at) requestData.end_at = params.end_at;

        const result = await this.request('POST', 'project/task/add', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const task = result.data as any;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: '任务创建成功',
              task: {
                id: task.id,
                name: task.name,
                project_id: task.project_id,
                column_id: task.column_id,
                created_at: task.created_at,
              },
            }, null, 2),
          }],
        };
      },
    });

    // 更新任务
    this.mcp.addTool({
      name: 'update_task',
      description: 'Update task properties. Only provide fields to modify.',
      parameters: z.object({
        task_id: z.number()
          .min(1)
          .describe('Task ID'),
        name: z.string()
          .optional()
          .describe('Task name'),
        content: z.string()
          .optional()
          .describe('Task content (Markdown format)'),
        owner: z.array(z.number())
          .optional()
          .describe('Array of owner user IDs'),
        assist: z.array(z.number())
          .optional()
          .describe('Array of assistant user IDs'),
        column_id: z.number()
          .optional()
          .describe('Target kanban column ID'),
        start_at: z.string()
          .optional()
          .describe('Start time, format: YYYY-MM-DD HH:mm:ss'),
        end_at: z.string()
          .optional()
          .describe('End time, format: YYYY-MM-DD HH:mm:ss'),
        complete_at: z.union([z.string(), z.boolean()])
          .optional()
          .describe('Completion time string to mark complete, or false to mark incomplete'),
        flow_item_id: z.number()
          .optional()
          .describe('Workflow status ID'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          task_id: params.task_id,
        };

        if (params.name !== undefined) requestData.name = params.name;
        if (params.content !== undefined) requestData.content = this.markdownToHtml(params.content);
        if (params.owner !== undefined) requestData.owner = params.owner;
        if (params.assist !== undefined) requestData.assist = params.assist;
        if (params.column_id !== undefined) requestData.column_id = params.column_id;
        if (params.start_at !== undefined) requestData.start_at = params.start_at;
        if (params.end_at !== undefined) requestData.end_at = params.end_at;
        if (params.complete_at !== undefined) requestData.complete_at = params.complete_at;
        if (params.flow_item_id !== undefined) requestData.flow_item_id = params.flow_item_id;

        const result = await this.request('POST', 'project/task/update', requestData, context);

        // 处理多结束状态的情况（标记完成时）
        if (result.ret === -4005) {
          const flowItems = (result.data as any)?.flow_items || [];
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: '存在多个结束状态，请选择要使用的状态后重新调用此工具，并指定flow_item_id参数',
                task_id: params.task_id,
                flow_items: flowItems,
              }, null, 2),
            }],
          };
        }

        // 处理多开始状态的情况（取消完成时）
        if (result.ret === -4006) {
          const flowItems = (result.data as any)?.flow_items || [];
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: '存在多个开始状态，请选择要使用的状态后重新调用此工具，并指定flow_item_id参数',
                task_id: params.task_id,
                flow_items: flowItems,
              }, null, 2),
            }],
          };
        }

        if (result.error) {
          throw new Error(result.error);
        }

        const task = result.data as any;
        const updates: string[] = [];
        if (params.name !== undefined) updates.push('名称');
        if (params.content !== undefined) updates.push('内容');
        if (params.owner !== undefined) updates.push('负责人');
        if (params.assist !== undefined) updates.push('协助人员');
        if (params.column_id !== undefined) updates.push('列');
        if (params.start_at !== undefined || params.end_at !== undefined) updates.push('时间');
        if (params.complete_at !== undefined) updates.push('完成状态');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `任务已更新: ${updates.join('、')}`,
              task: {
                id: task.id,
                name: task.name,
                status: task.complete_at ? '已完成' : '未完成',
                complete_at: task.complete_at || '未完成',
                updated_at: task.updated_at,
              },
            }, null, 2),
          }],
        };
      },
    });

    // 创建子任务
    this.mcp.addTool({
      name: 'create_sub_task',
      description: 'Add a subtask to a parent task. Inherits the parent task\'s project and kanban column.',
      parameters: z.object({
        task_id: z.number()
          .min(1)
          .describe('Parent task ID'),
        name: z.string()
          .min(1)
          .describe('Subtask name'),
      }),
      execute: async (params, context) => {
        const result = await this.request('POST', 'project/task/addsub', {
          task_id: params.task_id,
          name: params.name,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const subTask = result.data || {};

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              sub_task: {
                id: (subTask as any).id,
                name: (subTask as any).name,
                project_id: (subTask as any).project_id,
                parent_id: (subTask as any).parent_id,
                column_id: (subTask as any).column_id,
                start_at: (subTask as any).start_at,
                end_at: (subTask as any).end_at,
                created_at: (subTask as any).created_at,
              },
            }, null, 2),
          }],
        };
      },
    });

    // 获取任务附件
    this.mcp.addTool({
      name: 'get_task_files',
      description: 'Get attachment list for a task, including file name, size, and download URL.',
      parameters: z.object({
        task_id: z.number()
          .min(1)
          .describe('Task ID'),
      }),
      execute: async (params, context) => {
        const result = await this.request('GET', 'project/task/files', {
          task_id: params.task_id,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const files = Array.isArray(result.data) ? result.data : [];

        const normalized = files.map((file: any) => ({
          file_id: file.id,
          name: file.name,
          ext: file.ext,
          size: file.size,
          url: file.path,
          thumb: file.thumb,
          userid: file.userid,
          download_count: file.download,
          created_at: file.created_at,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              task_id: params.task_id,
              files: normalized,
            }, null, 2),
          }],
        };
      },
    });

    // 删除或还原任务
    this.mcp.addTool({
      name: 'delete_task',
      description: 'Delete or recover a task. Default is delete; use action=recovery to restore from trash.',
      parameters: z.object({
        task_id: z.number()
          .min(1)
          .describe('Task ID'),
        action: z.enum(['delete', 'recovery'])
          .optional()
          .describe('Action: delete (default) or recovery'),
      }),
      execute: async (params, context) => {
        const action = params.action || 'delete';

        const result = await this.request('POST', 'project/task/remove', {
          task_id: params.task_id,
          type: action,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action,
              task_id: params.task_id,
              data: result.data,
            }, null, 2),
          }],
        };
      },
    });

    // 获取项目列表
    this.mcp.addTool({
      name: 'list_projects',
      description: 'List projects accessible to the current user. Supports filtering by archive status and searching by name.',
      parameters: z.object({
        archived: z.enum(['no', 'yes', 'all'])
          .optional()
          .describe('Archive filter: no (unarchived), yes (archived), all. Default: no'),
        search: z.string()
          .optional()
          .describe('Search keyword (project name)'),
        page: z.number()
          .optional()
          .describe('Page number, default 1'),
        pagesize: z.number()
          .optional()
          .describe('Page size, default 20'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          archived: params.archived || 'no',
          page: params.page || 1,
          pagesize: params.pagesize || 20,
        };

        if (params.search) {
          requestData.keys = {
            name: params.search,
          };
        }

        const result = await this.request('GET', 'project/lists', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const projects = (result.data as any)?.data?.map((project: any) => ({
          project_id: project.id,
          name: project.name,
          desc: project.desc || '无描述',
          dialog_id: project.dialog_id,
          archived_at: project.archived_at || '未归档',
          owner_userid: project.owner_userid || 0,
          created_at: project.created_at,
        })) || [];

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: (result.data as any)?.total ?? projects.length,
              page: (result.data as any)?.current_page ?? (params.page || 1),
              pagesize: (result.data as any)?.per_page ?? (params.pagesize || 20),
              projects: projects,
            }, null, 2),
          }],
        };
      },
    });

    // 获取项目详情
    this.mcp.addTool({
      name: 'get_project',
      description: 'Get full project details including description, kanban columns, members, and permissions. More detailed than list_projects.',
      parameters: z.object({
        project_id: z.number()
          .min(1)
          .describe('Project ID'),
      }),
      execute: async (params, context) => {
        // 并行获取项目详情和列信息
        const [projectResult, columnsResult] = await Promise.all([
          this.request('GET', 'project/one', {
            project_id: params.project_id,
          }, context),
          this.request('GET', 'project/column/lists', {
            project_id: params.project_id,
          }, context),
        ]);

        if (projectResult.error) {
          throw new Error(projectResult.error);
        }

        const project = projectResult.data as any;

        // columns 需要单独获取
        const columns = columnsResult.error ? [] : ((columnsResult.data as any)?.data || []);

        const projectDetail = {
          project_id: project.id,
          name: project.name,
          desc: project.desc || '无描述',
          dialog_id: project.dialog_id,
          archived_at: project.archived_at || '未归档',
          owner_userid: project.owner_userid,
          columns: columns.map((col: any) => ({
            column_id: col.id,
            name: col.name,
            sort: col.sort,
          })),
          members: project.project_user?.map((user: any) => ({
            userid: user.userid,
            owner: user.owner === 1 ? '管理员' : '成员',
          })) || [],
          created_at: project.created_at,
          updated_at: project.updated_at,
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(projectDetail, null, 2),
          }],
        };
      },
    });

    // 创建项目
    this.mcp.addTool({
      name: 'create_project',
      description: 'Create a new project with optional description, initial columns, and workflow settings.',
      parameters: z.object({
        name: z.string()
          .min(2)
          .describe('Project name, min 2 characters'),
        desc: z.string()
          .optional()
          .describe('Project description'),
        columns: z.union([z.string(), z.array(z.string())])
          .optional()
          .describe('Initial column names, comma-separated string or string array'),
        flow: z.enum(['open', 'close'])
          .optional()
          .describe('Enable workflow: open or close. Default: close'),
        personal: z.boolean()
          .optional()
          .describe('Create as personal project (only one allowed)'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          name: params.name,
        };

        if (params.desc !== undefined) {
          requestData.desc = params.desc;
        }
        if (params.columns !== undefined) {
          requestData.columns = Array.isArray(params.columns) ? params.columns.join(',') : params.columns;
        }
        if (params.flow !== undefined) {
          requestData.flow = params.flow;
        }
        if (params.personal !== undefined) {
          requestData.personal = params.personal ? 1 : 0;
        }

        const result = await this.request('POST', 'project/add', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const project = result.data || {};

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              project: {
                id: (project as any).id,
                name: (project as any).name,
                desc: (project as any).desc || '',
                columns: (project as any).projectColumn || [],
                created_at: (project as any).created_at,
              },
            }, null, 2),
          }],
        };
      },
    });

    // 更新项目
    this.mcp.addTool({
      name: 'update_project',
      description: 'Update project info (name, description, archive policy). If name is omitted, the current name is preserved.',
      parameters: z.object({
        project_id: z.number()
          .min(1)
          .describe('Project ID'),
        name: z.string()
          .optional()
          .describe('Project name'),
        desc: z.string()
          .optional()
          .describe('Project description'),
        archive_method: z.string()
          .optional()
          .describe('Archive method'),
        archive_days: z.number()
          .optional()
          .describe('Auto-archive after N days'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          project_id: params.project_id,
        };

        if (params.name && params.name.trim().length > 0) {
          requestData.name = params.name;
        } else {
          const projectResult = await this.request('GET', 'project/one', {
            project_id: params.project_id,
          }, context);

          if (projectResult.error) {
            throw new Error(projectResult.error);
          }

          const currentName = (projectResult.data as any)?.name;
          if (!currentName) {
            throw new Error('无法获取项目名称，请手动提供 name 参数');
          }
          requestData.name = currentName;
        }

        if (params.desc !== undefined) {
          requestData.desc = params.desc;
        }
        if (params.archive_method !== undefined) {
          requestData.archive_method = params.archive_method;
        }
        if (params.archive_days !== undefined) {
          requestData.archive_days = params.archive_days;
        }

        const result = await this.request('GET', 'project/update', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const project = result.data || {};

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              project: {
                id: (project as any).id,
                name: (project as any).name,
                desc: (project as any).desc || '',
                archived_at: (project as any).archived_at || null,
                archive_method: (project as any).archive_method ?? (requestData.archive_method ?? null),
                archive_days: (project as any).archive_days ?? (requestData.archive_days ?? null),
                updated_at: (project as any).updated_at,
              },
            }, null, 2),
          }],
        };
      },
    });

    // 搜索对话
    this.mcp.addTool({
      name: 'search_dialogs',
      description: 'Search group chats or contact conversations by name.',
      parameters: z.object({
        keyword: z.string()
          .min(1)
          .describe('Search keyword'),
      }),
      execute: async (params, context) => {
        const result = await this.request('GET', 'dialog/search', {
          key: params.keyword,
          dialog_only: 1,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const dialogs = Array.isArray(result.data) ? result.data : [];

        const simplified = dialogs.map((dialog: any) => {
          const item: Record<string, unknown> = {
            type: dialog.type,
            name: dialog.name,
            last_at: dialog.last_at,
          };
          // 根据类型返回不同的 ID 字段
          if (typeof dialog.id === 'string' && dialog.id.startsWith('u:')) {
            // 还没有对话的用户，返回 userid
            item.userid = parseInt(dialog.id.slice(2), 10);
          } else {
            // 已有对话，返回 dialog_id
            item.dialog_id = dialog.id;
            // 如果是用户类型且有 dialog_user，也返回 userid
            if (dialog.type === 'user' && dialog.dialog_user?.userid) {
              item.userid = dialog.dialog_user.userid;
            }
          }
          return item;
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: simplified.length,
              dialogs: simplified,
            }, null, 2),
          }],
        };
      },
    });

    // 发送消息到对话
    this.mcp.addTool({
      name: 'send_message',
      description: 'Send a message to a conversation (private or group chat).',
      parameters: z.object({
        dialog_id: z.number()
          .optional()
          .describe('Dialog ID. Required if userid is not provided'),
        userid: z.number()
          .optional()
          .describe('User ID, opens or creates a private chat. Required if dialog_id is not provided'),
        text: z.string()
          .min(1)
          .describe('Message content'),
        text_type: z.enum(['md', 'html'])
          .optional()
          .describe('Message format: md or html. Default: md'),
        silence: z.boolean()
          .optional()
          .describe('Send silently without notification'),
      }),
      execute: async (params, context) => {
        let dialogId = params.dialog_id;

        // 如果没有 dialog_id，通过 userid 获取/创建对话
        if (!dialogId && params.userid) {
          const dialogResult = await this.request('GET', 'dialog/open/user', {
            userid: params.userid,
          }, context);
          if (dialogResult.error) {
            throw new Error(dialogResult.error);
          }
          dialogId = (dialogResult.data as any)?.id;
          if (!dialogId) {
            throw new Error('无法创建对话');
          }
        }

        if (!dialogId) {
          throw new Error('请提供 dialog_id 或 userid');
        }

        const payload: Record<string, unknown> = {
          dialog_id: dialogId,
          text: params.text,
          text_type: params.text_type || 'md',
        };

        if (params.silence !== undefined) {
          payload.silence = params.silence ? 'yes' : 'no';
        }

        const sendResult = await this.request('POST', 'dialog/msg/sendtext', payload, context);

        if (sendResult.error) {
          throw new Error(sendResult.error);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              dialog_id: dialogId,
              message: sendResult.data,
            }, null, 2),
          }],
        };
      },
    });

    // 以AI助手身份发送消息到任务对话
    this.mcp.addTool({
      name: 'send_task_ai_message',
      description: 'Send a message to a task conversation as AI assistant. Should be proactively called: after each major milestone, when blocked, and when all work is done.',
      parameters: z.object({
        task_id: z.number()
          .describe('Target task ID'),
        text: z.string()
          .min(1)
          .describe('Message content, supports Markdown'),
        silence: z.boolean()
          .optional()
          .describe('Send silently without push notification'),
      }),
      execute: async (params, context) => {
        const payload: Record<string, unknown> = {
          task_id: params.task_id,
          text: params.text,
          text_type: 'md',
        };

        if (params.silence !== undefined) {
          payload.silence = params.silence ? 'yes' : 'no';
        }

        const result = await this.request('POST', 'dialog/msg/send_ai_assistant', payload, context);

        if (result.error) {
          throw new Error(result.error);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              task_id: params.task_id,
              message: result.data,
            }, null, 2),
          }],
        };
      },
    });

    // 获取对话消息列表
    this.mcp.addTool({
      name: 'get_message_list',
      description: 'Get message history for a conversation.',
      parameters: z.object({
        dialog_id: z.number()
          .optional()
          .describe('Dialog ID. Required if userid is not provided'),
        userid: z.number()
          .optional()
          .describe('User ID, to get private chat history. Required if dialog_id is not provided'),
        msg_id: z.number()
          .optional()
          .describe('Load messages around this message ID'),
        prev_id: z.number()
          .optional()
          .describe('Get messages before this ID'),
        next_id: z.number()
          .optional()
          .describe('Get messages after this ID'),
        msg_type: z.enum(['tag', 'todo', 'link', 'text', 'image', 'file', 'record', 'meeting'])
          .optional()
          .describe('Filter by message type'),
        take: z.number()
          .optional()
          .describe('Number of messages, max 100'),
      }),
      execute: async (params, context) => {
        let dialogId = params.dialog_id;

        // 如果没有 dialog_id，通过 userid 查找对话
        if (!dialogId && params.userid) {
          const dialogResult = await this.request('GET', 'dialog/open/user', {
            userid: params.userid,
          }, context);
          // 如果获取失败或没有对话，返回空列表
          if (dialogResult.error || !(dialogResult.data as any)?.id) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  userid: params.userid,
                  count: 0,
                  messages: [],
                }, null, 2),
              }],
            };
          }
          dialogId = (dialogResult.data as any).id;
        }

        if (!dialogId) {
          throw new Error('请提供 dialog_id 或 userid');
        }

        const requestData: Record<string, unknown> = {
          dialog_id: dialogId,
        };

        if (params.msg_id !== undefined) requestData.msg_id = params.msg_id;
        if (params.prev_id !== undefined) requestData.prev_id = params.prev_id;
        if (params.next_id !== undefined) requestData.next_id = params.next_id;
        if (params.msg_type !== undefined) requestData.msg_type = params.msg_type;
        if (params.take !== undefined) {
          requestData.take = Math.min(Math.max(params.take, 1), 100);
        }

        const result = await this.request('GET', 'dialog/msg/list', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const data = result.data || {};
        const messages = Array.isArray((data as any).list) ? (data as any).list : [];

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              dialog_id: dialogId,
              count: messages.length,
              messages: messages,
            }, null, 2),
          }],
        };
      },
    });

    // 文件管理：获取文件列表
    this.mcp.addTool({
      name: 'list_files',
      description: 'List user files, optionally filtered by parent folder.',
      parameters: z.object({
        pid: z.number()
          .optional()
          .describe('Parent folder ID, 0 or omit for root directory'),
      }),
      execute: async (params, context) => {
        const pid = params.pid !== undefined ? params.pid : 0;

        const result = await this.request('GET', 'file/lists', {
          pid: pid,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const files = Array.isArray(result.data) ? result.data : [];

        const simplified = files.map((file: any) => ({
          file_id: file.id,
          name: file.name,
          type: file.type,
          ext: file.ext || '',
          size: file.size || 0,
          pid: file.pid,
          userid: file.userid,
          created_id: file.created_id,
          share: file.share ? true : false,
          created_at: file.created_at,
          updated_at: file.updated_at,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pid: pid,
              total: simplified.length,
              files: simplified,
            }, null, 2),
          }],
        };
      },
    });

    // 文件管理：搜索文件
    this.mcp.addTool({
      name: 'search_files',
      description: 'Search files by keyword. Supports file name, file ID, or share link. Includes owned and shared files.',
      parameters: z.object({
        keyword: z.string()
          .min(1)
          .describe('Search keyword: file name, file ID, or share link'),
        take: z.number()
          .optional()
          .describe('Max results, default 50, max 100'),
      }),
      execute: async (params, context) => {
        const take = params.take && params.take > 0 ? Math.min(params.take, 100) : 50;

        const result = await this.request('GET', 'file/search', {
          key: params.keyword,
          take: take,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const files = Array.isArray(result.data) ? result.data : [];

        const simplified = files.map((file: any) => ({
          file_id: file.id,
          name: file.name,
          type: file.type,
          ext: file.ext || '',
          size: file.size || 0,
          pid: file.pid,
          userid: file.userid,
          created_id: file.created_id,
          share: file.share ? true : false,
          created_at: file.created_at,
          updated_at: file.updated_at,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              keyword: params.keyword,
              total: simplified.length,
              files: simplified,
            }, null, 2),
          }],
        };
      },
    });

    // 文件管理：获取文件详情
    this.mcp.addTool({
      name: 'get_file_detail',
      description: 'Get file details including type, size, content, and sharing status.',
      parameters: z.object({
        file_id: z.union([z.number(), z.string()])
          .describe('File ID or share code'),
        with_content: z.boolean()
          .optional()
          .describe('Whether to extract text content from the file'),
        text_offset: z.number()
          .optional()
          .describe('Text start offset'),
        text_limit: z.number()
          .optional()
          .describe('Text length, default 50000, max 200000'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          id: params.file_id,
          with_url: 'yes',
        };

        // 如果需要提取文本内容
        if (params.with_content) {
          requestData.with_text = 'yes';
          if (params.text_offset !== undefined) {
            requestData.text_offset = params.text_offset;
          }
          if (params.text_limit !== undefined) {
            requestData.text_limit = Math.min(params.text_limit, 200000);
          }
        }

        const result = await this.request('GET', 'file/one', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const file = result.data as any;

        const fileDetail: Record<string, unknown> = {
          file_id: file.id,
          name: file.name,
          type: file.type,
          ext: file.ext || '',
          size: file.size || 0,
          pid: file.pid,
          userid: file.userid,
          created_id: file.created_id,
          share: file.share ? true : false,
          content_url: file.content_url || null,
          created_at: file.created_at,
          updated_at: file.updated_at,
        };

        // 如果有文本内容
        if (file.text_content) {
          if (file.text_content.error) {
            fileDetail.text_error = file.text_content.error;
          } else {
            fileDetail.text_content = file.text_content.content;
            fileDetail.text_total_length = file.text_content.total_length;
            fileDetail.text_offset = file.text_content.offset;
            fileDetail.text_limit = file.text_content.limit;
            fileDetail.text_has_more = file.text_content.has_more;
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(fileDetail, null, 2),
          }],
        };
      },
    });

    // 文件管理：通过路径获取文件内容
    this.mcp.addTool({
      name: 'fetch_file_content',
      description: 'Fetch text content by file path.',
      parameters: z.object({
        path: z.string()
          .describe('Internal file path or URL'),
        offset: z.number()
          .optional()
          .describe('Start offset'),
        limit: z.number()
          .optional()
          .describe('Length, default 50000, max 200000'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          path: params.path,
        };

        if (params.offset !== undefined) {
          requestData.offset = params.offset;
        }
        if (params.limit !== undefined) {
          requestData.limit = Math.min(params.limit, 200000);
        }

        const result = await this.request('GET', 'file/fetch', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2),
          }],
        };
      },
    });

    // 工作报告：获取接收的汇报列表
    this.mcp.addTool({
      name: 'list_received_reports',
      description: 'List work reports received by current user. Supports filtering by type, status, department, and time.',
      parameters: z.object({
        search: z.string()
          .optional()
          .describe('Search keyword (title, reporter email, or user ID)'),
        type: z.enum(['weekly', 'daily', 'all'])
          .optional()
          .describe('Report type: weekly, daily, or all. Default: all'),
        status: z.enum(['read', 'unread', 'all'])
          .optional()
          .describe('Read status: read, unread, or all. Default: all'),
        department_id: z.number()
          .optional()
          .describe('Department ID to filter by'),
        created_at_start: z.string()
          .optional()
          .describe('Start date, format: YYYY-MM-DD'),
        created_at_end: z.string()
          .optional()
          .describe('End date, format: YYYY-MM-DD'),
        page: z.number()
          .optional()
          .describe('Page number, default 1'),
        pagesize: z.number()
          .optional()
          .describe('Page size, default 20, max 50'),
      }),
      execute: async (params, context) => {
        const page = params.page && params.page > 0 ? params.page : 1;
        const pagesize = params.pagesize && params.pagesize > 0 ? Math.min(params.pagesize, 50) : 20;

        const keys: Record<string, unknown> = {};
        if (params.search) {
          keys.key = params.search;
        }
        if (params.type && params.type !== 'all') {
          keys.type = params.type;
        }
        if (params.status && params.status !== 'all') {
          keys.status = params.status;
        }
        if (params.department_id !== undefined) {
          keys.department_id = params.department_id;
        }
        if (params.created_at_start || params.created_at_end) {
          const dateRange = [];
          if (params.created_at_start) {
            dateRange.push(new Date(params.created_at_start).getTime());
          } else {
            dateRange.push(0);
          }
          if (params.created_at_end) {
            dateRange.push(new Date(params.created_at_end).getTime());
          } else {
            dateRange.push(0);
          }
          keys.created_at = dateRange;
        }

        const requestData: Record<string, unknown> = {
          page,
          pagesize,
        };
        if (Object.keys(keys).length > 0) {
          requestData.keys = keys;
        }

        const result = await this.request('GET', 'report/receive', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const data = result.data || {};
        const reports = Array.isArray((data as any).data) ? (data as any).data : [];

        const simplified = reports.map((report: any) => {
          const myReceive = Array.isArray(report.receives_user)
            ? report.receives_user.find((u: any) => u.pivot && u.pivot.userid)
            : null;

          return {
            report_id: report.id,
            title: report.title,
            type: report.type === 'daily' ? '日报' : '周报',
            sender_id: report.userid,
            is_read: myReceive && myReceive.pivot ? (myReceive.pivot.read === 1) : false,
            receive_at: report.receive_at || report.created_at,
            created_at: report.created_at,
          };
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: (data as any).total || reports.length,
              page: (data as any).current_page || page,
              pagesize: (data as any).per_page || pagesize,
              reports: simplified,
            }, null, 2),
          }],
        };
      },
    });

    // 工作报告：获取汇报详情
    this.mcp.addTool({
      name: 'get_report_detail',
      description: 'Get work report details including content, reporter, and recipients. Supports report ID or share code.',
      parameters: z.object({
        report_id: z.number()
          .optional()
          .describe('Report ID'),
        share_code: z.string()
          .optional()
          .describe('Report share code'),
      }),
      execute: async (params, context) => {
        if (!params.report_id && !params.share_code) {
          throw new Error('必须提供 report_id 或 share_code 参数之一');
        }

        const requestData: Record<string, unknown> = {};
        if (params.report_id) {
          requestData.id = params.report_id;
        } else if (params.share_code) {
          requestData.code = params.share_code;
        }

        const result = await this.request('GET', 'report/detail', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const report = result.data as any;

        // 将 HTML 内容转换为 Markdown
        const markdownContent = this.htmlToMarkdown(report.content || '');

        const reportDetail = {
          report_id: report.id,
          title: report.title,
          type: report.type === 'daily' ? '日报' : '周报',
          type_value: report.type_val || report.type,
          content: markdownContent,
          sender_id: report.userid,
          receivers: Array.isArray(report.receives_user)
            ? report.receives_user.map((u: any) => ({
                userid: u.userid,
                nickname: u.nickname || u.email,
                is_read: u.pivot ? (u.pivot.read === 1) : false,
              }))
            : [],
          ai_analysis: report.ai_analysis ? {
            text: report.ai_analysis.text,
            model: report.ai_analysis.model,
            updated_at: report.ai_analysis.updated_at,
          } : null,
          created_at: report.created_at,
          updated_at: report.updated_at,
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(reportDetail, null, 2),
          }],
        };
      },
    });

    // 工作报告：生成汇报模板
    this.mcp.addTool({
      name: 'generate_report_template',
      description: 'Auto-generate a work report template based on task completion.',
      parameters: z.object({
        type: z.enum(['weekly', 'daily'])
          .describe('Report type: weekly or daily'),
        offset: z.number()
          .optional()
          .describe('Time offset (non-negative, negative values are normalized): 0 = current period, 1 = previous, 2 = two periods ago. Default: 0'),
      }),
      execute: async (params, context) => {
        const offset = params.offset !== undefined ? Math.abs(params.offset) : 0;

        const result = await this.request('GET', 'report/template', {
          type: params.type,
          offset: offset,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const template = result.data as any;

        // 将 HTML 内容转换为 Markdown
        const markdownContent = this.htmlToMarkdown(template.content || '');

        const templateData = {
          sign: template.sign,
          title: template.title,
          content: markdownContent,
          existing_report_id: template.id || null,
          message: template.id
            ? '该时间周期已有报告，如需修改请使用 update_report 或在界面中编辑'
            : '模板已生成，可以直接使用或编辑 content 字段，然后使用 create_report 提交',
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(templateData, null, 2),
          }],
        };
      },
    });

    // 工作报告：创建汇报
    this.mcp.addTool({
      name: 'create_report',
      description: 'Create and submit a work report. Typically use generate_report_template first, then submit with this tool.',
      parameters: z.object({
        type: z.enum(['weekly', 'daily'])
          .describe('Report type: weekly or daily'),
        title: z.string()
          .describe('Report title'),
        content: z.string()
          .describe('Report content (Markdown format), usually from generate_report_template'),
        receive: z.array(z.number())
          .optional()
          .describe('Array of recipient user IDs, excluding self'),
        sign: z.string()
          .optional()
          .describe('Unique signature from generate_report_template'),
        offset: z.number()
          .optional()
          .describe('Time offset (non-negative, negative values are normalized), should match template generation. Default: 0'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          id: 0,
          title: params.title,
          type: params.type,
          content: this.markdownToHtml(params.content),
          offset: params.offset !== undefined ? Math.abs(params.offset) : 0,
        };

        if (params.receive && Array.isArray(params.receive)) {
          requestData.receive = params.receive;
        }
        if (params.sign) {
          requestData.sign = params.sign;
        }

        const result = await this.request('POST', 'report/store', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const report = (result.data || {}) as any;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: '工作汇报创建成功',
              report: {
                report_id: report.id,
                title: report.title,
                type: report.type === 'daily' ? '日报' : '周报',
                created_at: report.created_at,
              },
            }, null, 2),
          }],
        };
      },
    });

    // 工作报告：获取我发送的汇报列表
    this.mcp.addTool({
      name: 'list_my_reports',
      description: 'List work reports sent by current user. Supports filtering by type, time, and search.',
      parameters: z.object({
        search: z.string()
          .optional()
          .describe('Search keyword (title)'),
        type: z.enum(['weekly', 'daily', 'all'])
          .optional()
          .describe('Report type: weekly, daily, or all. Default: all'),
        created_at_start: z.string()
          .optional()
          .describe('Start date, format: YYYY-MM-DD'),
        created_at_end: z.string()
          .optional()
          .describe('End date, format: YYYY-MM-DD'),
        page: z.number()
          .optional()
          .describe('Page number, default 1'),
        pagesize: z.number()
          .optional()
          .describe('Page size, default 20, max 50'),
      }),
      execute: async (params, context) => {
        const page = params.page && params.page > 0 ? params.page : 1;
        const pagesize = params.pagesize && params.pagesize > 0 ? Math.min(params.pagesize, 50) : 20;

        const keys: Record<string, unknown> = {};
        if (params.search) {
          keys.key = params.search;
        }
        if (params.type && params.type !== 'all') {
          keys.type = params.type;
        }
        if (params.created_at_start || params.created_at_end) {
          const dateRange = [];
          if (params.created_at_start) {
            dateRange.push(new Date(params.created_at_start).getTime());
          } else {
            dateRange.push(0);
          }
          if (params.created_at_end) {
            dateRange.push(new Date(params.created_at_end).getTime());
          } else {
            dateRange.push(0);
          }
          keys.created_at = dateRange;
        }

        const requestData: Record<string, unknown> = {
          page,
          pagesize,
        };
        if (Object.keys(keys).length > 0) {
          requestData.keys = keys;
        }

        const result = await this.request('GET', 'report/my', requestData, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const data = result.data || {};
        const reports = Array.isArray((data as any).data) ? (data as any).data : [];

        const simplified = reports.map((report: any) => ({
          report_id: report.id,
          title: report.title,
          type: report.type === 'daily' ? '日报' : '周报',
          receivers: Array.isArray(report.receives) ? report.receives : [],
          receiver_count: Array.isArray(report.receives) ? report.receives.length : 0,
          created_at: report.created_at,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: (data as any).total || reports.length,
              page: (data as any).current_page || page,
              pagesize: (data as any).per_page || pagesize,
              reports: simplified,
            }, null, 2),
          }],
        };
      },
    });

    // 工作报告：标记已读/未读
    this.mcp.addTool({
      name: 'mark_reports_read',
      description: 'Batch mark work reports as read or unread.',
      parameters: z.object({
        report_ids: z.union([z.number(), z.array(z.number())])
          .describe('Report ID or ID array, max 100'),
        action: z.enum(['read', 'unread'])
          .optional()
          .describe('Action: read or unread. Default: read'),
      }),
      execute: async (params, context) => {
        const action = params.action || 'read';
        const ids = Array.isArray(params.report_ids) ? params.report_ids : [params.report_ids];

        if (ids.length > 100) {
          throw new Error('最多只能操作100条数据');
        }

        const result = await this.request('GET', 'report/mark', {
          id: ids,
          action: action,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `已将 ${ids.length} 个报告标记为${action === 'read' ? '已读' : '未读'}`,
              action: action,
              affected_count: ids.length,
              report_ids: ids,
            }, null, 2),
          }],
        };
      },
    });

    // 智能搜索：统一搜索工具
    this.mcp.addTool({
      name: 'intelligent_search',
      description: 'Unified search across tasks, projects, files, contacts, and messages. Supports semantic search.',
      parameters: z.object({
        keyword: z.string()
          .min(1)
          .describe('Search keyword'),
        types: z.array(z.enum(['task', 'project', 'file', 'contact', 'message']))
          .optional()
          .describe('Search types: task, project, file, contact, message. Omit to search all'),
        search_type: z.enum(['text', 'vector', 'hybrid'])
          .optional()
          .describe('Search mode: text, vector, or hybrid (default)'),
        take: z.number()
          .optional()
          .describe('Results per type, default 10, max 50'),
      }),
      execute: async (params, context) => {
        const keyword = params.keyword;
        const searchType = params.search_type || 'hybrid';
        const take = params.take && params.take > 0 ? Math.min(params.take, 50) : 10;
        const types = params.types && params.types.length > 0
          ? params.types
          : ['task', 'project', 'file', 'contact', 'message'];

        const results: Record<string, any[]> = {
          tasks: [],
          projects: [],
          files: [],
          contacts: [],
          messages: [],
        };

        const searchPromises: Promise<void>[] = [];

        // 搜索任务
        if (types.includes('task')) {
          searchPromises.push(
            this.request('GET', 'search/task', {
              key: keyword,
              search_type: searchType,
              take: take,
            }, context).then((result) => {
              if (!result.error && Array.isArray(result.data)) {
                results.tasks = result.data.map((task: any) => ({
                  task_id: task.id,
                  name: task.name,
                  desc: task.desc || '',
                  content_preview: task.content_preview || '',
                  status: task.complete_at ? '已完成' : '未完成',
                  project_id: task.project_id,
                  parent_id: task.parent_id || 0,
                  project_name: task.project_name || '',
                  end_at: task.end_at || '',
                  relevance: task.relevance || 0,
                }));
              }
            }).catch(() => {})
          );
        }

        // 搜索项目
        if (types.includes('project')) {
          searchPromises.push(
            this.request('GET', 'search/project', {
              key: keyword,
              search_type: searchType,
              take: take,
            }, context).then((result) => {
              if (!result.error && Array.isArray(result.data)) {
                results.projects = result.data.map((project: any) => ({
                  project_id: project.id,
                  name: project.name,
                  desc: project.desc || '',
                  desc_preview: project.desc_preview || '',
                  archived: !!project.archived_at,
                  relevance: project.relevance || 0,
                }));
              }
            }).catch(() => {})
          );
        }

        // 搜索文件
        if (types.includes('file')) {
          searchPromises.push(
            this.request('GET', 'search/file', {
              key: keyword,
              search_type: searchType,
              take: take,
            }, context).then((result) => {
              if (!result.error && Array.isArray(result.data)) {
                results.files = result.data.map((file: any) => ({
                  file_id: file.id,
                  name: file.name,
                  type: file.type,
                  ext: file.ext || '',
                  size: file.size || 0,
                  content_preview: file.content_preview || '',
                  relevance: file.relevance || 0,
                }));
              }
            }).catch(() => {})
          );
        }

        // 搜索联系人
        if (types.includes('contact')) {
          searchPromises.push(
            this.request('GET', 'search/contact', {
              key: keyword,
              search_type: searchType,
              take: take,
            }, context).then((result) => {
              if (!result.error && Array.isArray(result.data)) {
                results.contacts = result.data.map((user: any) => ({
                  userid: user.userid,
                  nickname: user.nickname || '',
                  email: user.email || '',
                  profession: user.profession || '',
                  introduction_preview: user.introduction_preview || '',
                  relevance: user.relevance || 0,
                }));
              }
            }).catch(() => {})
          );
        }

        // 搜索消息
        if (types.includes('message')) {
          searchPromises.push(
            this.request('GET', 'search/message', {
              key: keyword,
              search_type: searchType,
              take: take,
            }, context).then((result) => {
              if (!result.error && Array.isArray(result.data)) {
                results.messages = result.data.map((msg: any) => ({
                  msg_id: msg.id,
                  dialog_id: msg.dialog_id,
                  userid: msg.userid,
                  nickname: msg.user?.nickname || '',
                  type: msg.type || '',
                  content_preview: msg.content_preview || msg.msg || '',
                  created_at: msg.created_at || '',
                  relevance: msg.relevance || 0,
                }));
              }
            }).catch(() => {})
          );
        }

        // 等待所有搜索完成
        await Promise.all(searchPromises);

        const totalCount = results.tasks.length
          + results.projects.length
          + results.files.length
          + results.contacts.length
          + results.messages.length;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              keyword,
              search_type: searchType,
              types_searched: types,
              results,
              total_count: totalCount,
              summary: {
                tasks: results.tasks.length,
                projects: results.projects.length,
                files: results.files.length,
                contacts: results.contacts.length,
                messages: results.messages.length,
              },
            }, null, 2),
          }],
        };
      },
    });

    // OCR: 图片文字提取
    this.mcp.addTool({
      name: 'extract_image_text',
      description: 'Extract text from images (OCR). Supports Chinese and English. Works with screenshots and scanned documents.',
      parameters: z.object({
        file_id: z.union([z.number(), z.string()])
          .optional()
          .describe('File ID or share code. Required if image_url is not provided'),
        image_url: z.string()
          .optional()
          .describe('Image URL. Required if file_id is not provided'),
      }),
      execute: async (params, context) => {
        // 参数校验
        if (params.file_id === undefined && !params.image_url) {
          throw new Error('请提供 file_id 或 image_url 参数');
        }

        try {
          // 确定图片 URL
          let imageUrl = params.image_url;

          if (params.file_id !== undefined) {
            // 从 DooTask 获取文件下载 URL
            imageUrl = await this.getFileContentUrl(params.file_id, context);
          }

          this.logger.info({ file_id: params.file_id, image_url: imageUrl }, 'Calling OCR API');

          // 调用内部 OCR API
          const response = await axios.post(OCR_API_URL, {
            image_url: imageUrl,
          }, {
            timeout: 120000, // 2 分钟超时
            headers: {
              'Content-Type': 'application/json',
            },
          });

          const result = response.data;

          this.logger.info({
            textLength: result.text?.length || 0,
            confidence: result.confidence,
            languages: result.languages,
          }, 'OCR completed via API');

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2),
            }],
          };
        } catch (error: any) {
          this.logger.error({ err: error, file_id: params.file_id, image_url: params.image_url }, 'OCR failed');

          // 处理 axios 错误响应
          if (error.response?.data?.error) {
            throw new Error(`OCR 识别失败: ${error.response.data.error}`);
          }

          throw new Error(`OCR 识别失败: ${error.message}`);
        }
      },
    });
  }
}
