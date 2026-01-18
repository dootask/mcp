import { z } from 'zod';
import type { ConnectionManager } from './ConnectionManager';
import type { Logger } from 'pino';

export function createOperationTools(connectionManager: ConnectionManager, logger: Logger) {
  return {
    get_page_context: {
      name: 'get_page_context',
      description: '获取当前页面上下文：页面类型、可交互元素、可用操作(available_actions)。',
      parameters: z.object({
        session_id: z.string()
          .describe('会话标识'),
        query: z.string()
          .optional()
          .describe('按关键词/语义筛选元素'),
        include_elements: z.boolean()
          .optional()
          .default(true)
          .describe('是否返回元素列表'),
        interactive_only: z.boolean()
          .optional()
          .default(false)
          .describe('仅返回可交互元素'),
        max_elements: z.number()
          .optional()
          .default(100)
          .describe('返回元素数量上限'),
        offset: z.number()
          .optional()
          .default(0)
          .describe('跳过前N个元素'),
        container: z.string()
          .optional()
          .describe('容器选择器，限定扫描范围'),
      }),
      execute: async (params: {
        session_id: string;
        query?: string;
        include_elements?: boolean;
        interactive_only?: boolean;
        max_elements?: number;
        offset?: number;
        container?: string;
      }) => {
        logger.info({ sessionId: params.session_id, query: params.query, offset: params.offset, container: params.container }, 'get_page_context called');

        if (!connectionManager.hasConnection(params.session_id)) {
          throw new Error('客户端未连接，请确保用户已打开AI助手');
        }

        const result = await connectionManager.sendRequest(
          params.session_id,
          'get_page_context',
          {
            query: params.query,
            include_elements: params.include_elements ?? true,
            interactive_only: params.interactive_only ?? false,
            max_elements: params.max_elements ?? 100,
            offset: params.offset ?? 0,
            container: params.container,
          },
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      },
    },

    execute_action: {
      name: 'execute_action',
      description: '在用户页面执行操作（打开任务/对话详情、切换项目、页面跳转等）。操作名称从available_actions中选择。',
      parameters: z.object({
        session_id: z.string()
          .describe('会话标识'),
        action: z.string()
          .describe('操作名称，支持简写如open_task_123'),
        params: z.record(z.unknown())
          .optional()
          .describe('操作参数'),
      }),
      execute: async (params: { session_id: string; action: string; params?: Record<string, unknown> }) => {
        logger.info({ sessionId: params.session_id, action: params.action }, 'execute_action called');

        if (!connectionManager.hasConnection(params.session_id)) {
          throw new Error('客户端未连接，请确保用户已打开AI助手');
        }

        const result = await connectionManager.sendRequest(
          params.session_id,
          'execute_action',
          { name: params.action, params: params.params || {} },
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      },
    },

    execute_element_action: {
      name: 'execute_element_action',
      description: '操作页面元素。元素标识从get_page_context返回的elements中获取。',
      parameters: z.object({
        session_id: z.string()
          .describe('会话标识'),
        element_uid: z.string()
          .describe('元素标识（如e1）或CSS选择器'),
        action: z.enum(['click', 'type', 'select', 'focus', 'scroll', 'hover'])
          .describe('click(点击), type(输入), select(选择), focus(聚焦), scroll(滚动), hover(悬停)'),
        value: z.string()
          .optional()
          .describe('type/select时的输入值'),
      }),
      execute: async (params: { session_id: string; element_uid: string; action: string; value?: string }) => {
        logger.info({ sessionId: params.session_id, elementUid: params.element_uid, action: params.action }, 'execute_element_action called');

        if (!connectionManager.hasConnection(params.session_id)) {
          throw new Error('客户端未连接，请确保用户已打开AI助手');
        }

        const result = await connectionManager.sendRequest(
          params.session_id,
          'execute_element_action',
          {
            element_uid: params.element_uid,
            action: params.action,
            value: params.value,
          },
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      },
    },
  };
}
