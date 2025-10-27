/* eslint-disable @typescript-eslint/no-explicit-any */

import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { IncomingMessage } from 'node:http';
import { DooTaskToolsClient, RequestResult } from './dootaskClient';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export class DooTaskMcpServer {
  readonly mcp: FastMCP;

  constructor(
    private readonly client: DooTaskToolsClient,
    private readonly logger: Logger,
  ) {
    this.mcp = new FastMCP({
      name: 'DooTask MCP Server',
      version: '0.1.0',
      authenticate: this.authenticateRequest.bind(this),
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

  private async request(
    method: HttpMethod,
    path: string,
    data: Record<string, unknown>,
    context: any,
  ): Promise<RequestResult> {
    const token = this.extractToken(context);
    if (!token) {
      this.logger.warn({ tool: path }, 'Missing Authorization token for MCP request');
      return {
        error: 'Authorization header missing. Please configure your MCP client with "Authorization: Bearer <DooTaskToken>".',
      };
    }

    return this.client.request(method, path, data, token);
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

    if (!headers) {
      throw new Error('Authorization header missing. Please configure your MCP client with "Authorization: Bearer <DooTaskToken>".');
    }

    const token = this.findAuthorization(headers);
    if (!token) {
      throw new Error('Authorization header missing. Please configure your MCP client with "Authorization: Bearer <DooTaskToken>".');
    }

    return {
      headers,
      token,
    };
  }

  private extractToken(context: any): string | undefined {
    const sessionToken = this.readSessionToken(context?.session);
    const candidates = [
      this.normalizeHeaders(context?.metadata?.headers),
      this.normalizeHeaders(context?.session?.metadata?.headers),
      this.normalizeHeaders(context?.headers),
      this.normalizeHeaders(context?.request?.headers),
      this.normalizeHeaders(context?.session?.headers),
    ].filter(Boolean) as Record<string, string>[];

    this.logger.debug(
      {
        sessionToken: sessionToken ? this.previewAuthorizationValue(sessionToken) : undefined,
        headerSources: candidates.map((headers) => this.previewHeaders(headers)),
      },
      'Inspecting incoming headers for authorization token',
    );

    if (sessionToken) {
      return sessionToken;
    }

    for (const headers of candidates) {
      const header = this.findAuthorization(headers);
      if (header) {
        return header;
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

  private setupTools(): void {
    // 用户管理：获取用户基础信息
    this.mcp.addTool({
      name: 'get_users_basic',
      description: '根据用户ID列表获取用户基础信息（昵称、邮箱、头像等），方便在分配任务前确认成员身份。',
      parameters: z.object({
        userids: z.array(z.number())
          .min(1)
          .max(50)
          .describe('用户ID数组，至少1个，最多50个'),
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
          avatar: user.avatar || '',
          identity: user.identity || '',
          department: user.department || '',
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: users.length,
              users,
            }, null, 2),
          }],
        };
      },
    });

    // 用户管理：搜索用户
    this.mcp.addTool({
      name: 'search_user',
      description: '按关键词搜索或筛选用户，支持按项目/对话过滤并返回分页结果。',
      parameters: z.object({
        keyword: z.string()
          .min(1)
          .describe('搜索关键词，支持昵称、邮箱、拼音等'),
        project_id: z.number()
          .optional()
          .describe('仅返回指定项目的成员'),
        dialog_id: z.number()
          .optional()
          .describe('仅返回指定对话的成员'),
        include_disabled: z.boolean()
          .optional()
          .describe('是否同时包含已离职/禁用用户'),
        include_bot: z.boolean()
          .optional()
          .describe('是否同时包含机器人账号'),
        with_department: z.boolean()
          .optional()
          .describe('是否返回部门信息'),
        page: z.number()
          .optional()
          .describe('页码，默认1'),
        pagesize: z.number()
          .optional()
          .describe('每页数量，默认20，最大100'),
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
      description: '获取任务列表。可以按状态筛选(已完成/未完成)、搜索任务名称、按时间范围筛选等。',
      parameters: z.object({
        status: z.enum(['all', 'completed', 'uncompleted'])
          .optional()
          .describe('任务状态: all(所有), completed(已完成), uncompleted(未完成)'),
        search: z.string()
          .optional()
          .describe('搜索关键词(可搜索任务ID、名称、描述)'),
        time: z.string()
          .optional()
          .describe('时间范围: today(今天), week(本周), month(本月), year(今年), 自定义时间范围,如：2025-12-12,2025-12-30'),
        project_id: z.number()
          .optional()
          .describe('项目ID,只获取指定项目的任务'),
        parent_id: z.number()
          .optional()
          .describe('主任务ID。大于0:获取该主任务的子任务; -1:仅获取主任务; 不传:所有任务'),
        page: z.number()
          .optional()
          .describe('页码,默认1'),
        pagesize: z.number()
          .optional()
          .describe('每页数量,默认20,最大100'),
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
          id: task.id,
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
          owners: task.taskUser?.filter((u: any) => u.owner === 1).map((u: any) => ({
            userid: u.userid,
            username: u.username || u.nickname || `用户${u.userid}`,
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
              tasks,
            }, null, 2),
          }],
        };
      },
    });

    // 获取任务详情
    this.mcp.addTool({
      name: 'get_task',
      description: '获取指定任务的详细信息,包括任务描述、完整内容、负责人、协助人员、标签、时间等所有信息。',
      parameters: z.object({
        task_id: z.number()
          .describe('任务ID'),
      }),
      execute: async (params, context) => {
        const taskResult = await this.request('GET', 'project/task/one', {
          task_id: params.task_id,
        }, context);

        if (taskResult.error) {
          throw new Error(taskResult.error);
        }

        const task = taskResult.data as any;

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

        const taskUsers = Array.isArray(task?.taskUser) ? task.taskUser : undefined;
        const owners = taskUsers
          ? taskUsers.filter((user: any) => user.owner === 1)
          : Array.isArray(task?.owner)
            ? task.owner
            : [];
        const assistants = taskUsers
          ? taskUsers.filter((user: any) => user.owner === 0)
          : Array.isArray(task?.assist)
            ? task.assist
            : [];

        const taskDetail = {
          id: task.id,
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
          owners: owners.map((user: any) => ({
            userid: user.userid,
            username: user.username || user.nickname || `用户${user.userid}`,
          })),
          assistants: assistants.map((user: any) => ({
            userid: user.userid,
            username: user.username || user.nickname || `用户${user.userid}`,
          })),
          tags: Array.isArray(task.taskTag)
            ? task.taskTag.map((tag: any) => tag.name)
            : task.tags || [],
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
      description: '快速标记任务完成（自动使用当前时间）。如需指定完成时间或取消完成，请使用 update_task。注意:主任务必须在所有子任务完成后才能标记完成。',
      parameters: z.object({
        task_id: z.number()
          .describe('要标记完成的任务ID'),
      }),
      execute: async (params, context) => {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const result = await this.request('POST', 'project/task/update', {
          task_id: params.task_id,
          complete_at: now,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const data = result.data as any;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: '任务已标记为完成',
              task_id: params.task_id,
              complete_at: data?.complete_at || now,
            }, null, 2),
          }],
        };
      },
    });

    // 创建任务
    this.mcp.addTool({
      name: 'create_task',
      description: '创建新任务。需要指定项目 ID 和任务名称，其他信息可选。',
      parameters: z.object({
        project_id: z.number()
          .describe('所属项目ID'),
        name: z.string()
          .min(1)
          .describe('任务名称'),
        content: z.string()
          .optional()
          .describe('任务描述或内容'),
        owner: z.array(z.number())
          .optional()
          .describe('负责人用户ID数组'),
        assist: z.array(z.number())
          .optional()
          .describe('协助人员用户ID数组'),
        column_id: z.number()
          .optional()
          .describe('指定任务所属列ID'),
        start_at: z.string()
          .optional()
          .describe('开始时间，格式: YYYY-MM-DD HH:mm:ss'),
        end_at: z.string()
          .optional()
          .describe('结束时间，格式: YYYY-MM-DD HH:mm:ss'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          project_id: params.project_id,
          name: params.name,
        };

        if (params.content) requestData.content = params.content;
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
      description: '更新任务信息。可以修改任务名称、内容、负责人、时间、状态等所有属性。',
      parameters: z.object({
        task_id: z.number()
          .describe('任务ID'),
        name: z.string()
          .optional()
          .describe('任务名称'),
        content: z.string()
          .optional()
          .describe('任务内容描述'),
        owner: z.array(z.number())
          .optional()
          .describe('负责人用户ID数组'),
        assist: z.array(z.number())
          .optional()
          .describe('协助人员用户ID数组'),
        column_id: z.number()
          .optional()
          .describe('移动到指定列ID'),
        start_at: z.string()
          .optional()
          .describe('开始时间，格式: YYYY-MM-DD HH:mm:ss'),
        end_at: z.string()
          .optional()
          .describe('结束时间，格式: YYYY-MM-DD HH:mm:ss'),
        complete_at: z.union([z.string(), z.boolean()])
          .optional()
          .describe('完成时间。传时间字符串标记完成，传false标记未完成'),
      }),
      execute: async (params, context) => {
        const requestData: Record<string, unknown> = {
          task_id: params.task_id,
        };

        if (params.name !== undefined) requestData.name = params.name;
        if (params.content !== undefined) requestData.content = params.content;
        if (params.owner !== undefined) requestData.owner = params.owner;
        if (params.assist !== undefined) requestData.assist = params.assist;
        if (params.column_id !== undefined) requestData.column_id = params.column_id;
        if (params.start_at !== undefined) requestData.start_at = params.start_at;
        if (params.end_at !== undefined) requestData.end_at = params.end_at;
        if (params.complete_at !== undefined) requestData.complete_at = params.complete_at;

        const result = await this.request('POST', 'project/task/update', requestData, context);

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
      description: '为指定主任务新增子任务，自动继承主任务所属项目与看板列配置。',
      parameters: z.object({
        task_id: z.number()
          .describe('主任务ID'),
        name: z.string()
          .min(1)
          .describe('子任务名称'),
      }),
      execute: async (params, context) => {
        const result = await this.request('GET', 'project/task/addsub', {
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
      description: '获取指定任务的附件列表，包含文件名称、大小、下载地址等信息。',
      parameters: z.object({
        task_id: z.number()
          .describe('任务ID'),
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
          id: file.id,
          name: file.name,
          ext: file.ext,
          size: file.size,
          url: file.path,
          thumb: file.thumb,
          userid: file.userid,
          download: file.download,
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
      description: '删除或还原任务。默认执行删除，可通过 action=recovery 将任务从回收站恢复。',
      parameters: z.object({
        task_id: z.number()
          .describe('任务ID'),
        action: z.enum(['delete', 'recovery'])
          .optional()
          .describe('操作类型：delete(默认) 删除，recovery 还原'),
      }),
      execute: async (params, context) => {
        const action = params.action || 'delete';

        const result = await this.request('GET', 'project/task/remove', {
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
      description: '获取项目列表。可以按归档状态筛选、搜索项目名称等。',
      parameters: z.object({
        archived: z.enum(['no', 'yes', 'all'])
          .optional()
          .describe('归档状态: no(未归档), yes(已归档), all(全部)，默认no'),
        search: z.string()
          .optional()
          .describe('搜索关键词(可搜索项目名称)'),
        page: z.number()
          .optional()
          .describe('页码，默认1'),
        pagesize: z.number()
          .optional()
          .describe('每页数量，默认20'),
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
          id: project.id,
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
              projects,
            }, null, 2),
          }],
        };
      },
    });

    // 获取项目详情
    this.mcp.addTool({
      name: 'get_project',
      description: '获取指定项目的详细信息，包括项目的列（看板列）、成员等完整信息。',
      parameters: z.object({
        project_id: z.number()
          .describe('项目ID'),
      }),
      execute: async (params, context) => {
        const result = await this.request('GET', 'project/one', {
          project_id: params.project_id,
        }, context);

        if (result.error) {
          throw new Error(result.error);
        }

        const project = result.data as any;

        const projectDetail = {
          id: project.id,
          name: project.name,
          desc: project.desc || '无描述',
          dialog_id: project.dialog_id,
          archived_at: project.archived_at || '未归档',
          owner_userid: project.owner_userid,
          owner_username: project.owner_username,
          columns: project.projectColumn?.map((col: any) => ({
            id: col.id,
            name: col.name,
            sort: col.sort,
          })) || [],
          members: project.projectUser?.map((user: any) => ({
            userid: user.userid,
            username: user.username,
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
      description: '创建新项目，可选设置项目描述、初始化列及流程状态。',
      parameters: z.object({
        name: z.string()
          .min(2)
          .describe('项目名称，至少2个字符'),
        desc: z.string()
          .optional()
          .describe('项目描述'),
        columns: z.union([z.string(), z.array(z.string())])
          .optional()
          .describe('初始化列名称，字符串使用逗号分隔，也可直接传字符串数组'),
        flow: z.enum(['open', 'close'])
          .optional()
          .describe('是否开启流程，open/close，默认close'),
        personal: z.boolean()
          .optional()
          .describe('是否创建个人项目，仅支持创建一个个人项目'),
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

        const result = await this.request('GET', 'project/add', requestData, context);

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
      description: '修改项目信息（名称、描述、归档策略等）。若未传 name 将自动沿用项目当前名称。',
      parameters: z.object({
        project_id: z.number()
          .describe('项目ID'),
        name: z.string()
          .optional()
          .describe('项目名称'),
        desc: z.string()
          .optional()
          .describe('项目描述'),
        archive_method: z.string()
          .optional()
          .describe('归档方式'),
        archive_days: z.number()
          .optional()
          .describe('自动归档天数'),
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

    // 发送消息给用户
    this.mcp.addTool({
      name: 'send_message_to_user',
      description: '给指定用户发送私信，可选择 Markdown 或 HTML 格式，并支持静默发送。',
      parameters: z.object({
        user_id: z.number()
          .describe('接收方用户ID'),
        text: z.string()
          .min(1)
          .describe('消息内容'),
        text_type: z.enum(['md', 'html'])
          .optional()
          .describe('消息类型，默认md，可选md/html'),
        silence: z.boolean()
          .optional()
          .describe('是否静默发送（不触发提醒）'),
      }),
      execute: async (params, context) => {
        const dialogResult = await this.request('GET', 'dialog/open/user', {
          userid: params.user_id,
        }, context);

        if (dialogResult.error) {
          throw new Error(dialogResult.error);
        }

        const dialogData = dialogResult.data || {};
        const dialogId = (dialogData as any).id;

        if (!dialogId) {
          throw new Error('未能获取会话ID，无法发送消息');
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
              data: sendResult.data,
            }, null, 2),
          }],
        };
      },
    });

    // 获取消息列表或搜索消息
    this.mcp.addTool({
      name: 'get_message_list',
      description: '获取指定对话的消息列表，或按关键字搜索消息位置/内容。',
      parameters: z.object({
        dialog_id: z.number()
          .optional()
          .describe('对话ID，获取消息列表时必填'),
        keyword: z.string()
          .optional()
          .describe('搜索关键词，提供时执行消息搜索'),
        msg_id: z.number()
          .optional()
          .describe('围绕某条消息加载相关内容'),
        position_id: z.number()
          .optional()
          .describe('以position_id为中心加载消息'),
        prev_id: z.number()
          .optional()
          .describe('获取此消息之前的历史'),
        next_id: z.number()
          .optional()
          .describe('获取此消息之后的新消息'),
        msg_type: z.enum(['tag', 'todo', 'link', 'text', 'image', 'file', 'record', 'meeting'])
          .optional()
          .describe('按消息类型筛选'),
        take: z.number()
          .optional()
          .describe('获取条数，列表模式最大100，搜索模式受接口限制'),
      }),
      execute: async (params, context) => {
        const keyword = params.keyword?.trim();

        if (keyword) {
          const searchPayload: Record<string, unknown> = {
            key: keyword,
          };
          if (params.dialog_id) {
            searchPayload.dialog_id = params.dialog_id;
          }
          if (params.take && params.take > 0) {
            const takeValue = params.take;
            searchPayload.take = params.dialog_id
              ? Math.min(takeValue, 200)
              : Math.min(takeValue, 50);
          }

          const searchResult = await this.request('GET', 'dialog/msg/search', searchPayload, context);

          if (searchResult.error) {
            throw new Error(searchResult.error);
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                mode: params.dialog_id ? 'position_search' : 'global_search',
                keyword,
                dialog_id: params.dialog_id || null,
                data: searchResult.data,
              }, null, 2),
            }],
          };
        }

        if (!params.dialog_id) {
          throw new Error('请提供 dialog_id 以获取消息列表，或提供 keyword 执行搜索');
        }

        const requestData: Record<string, unknown> = {
          dialog_id: params.dialog_id,
        };

        if (params.msg_id !== undefined) requestData.msg_id = params.msg_id;
        if (params.position_id !== undefined) requestData.position_id = params.position_id;
        if (params.prev_id !== undefined) requestData.prev_id = params.prev_id;
        if (params.next_id !== undefined) requestData.next_id = params.next_id;
        if (params.msg_type !== undefined) requestData.msg_type = params.msg_type;
        if (params.take !== undefined) {
          const takeValue = params.take > 0 ? params.take : 1;
          requestData.take = Math.min(takeValue, 100);
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
              dialog_id: params.dialog_id,
              count: messages.length,
              time: (data as any).time,
              dialog: (data as any).dialog,
              top: (data as any).top,
              todo: (data as any).todo,
              messages,
            }, null, 2),
          }],
        };
      },
    });
  }
}
