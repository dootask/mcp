import { z } from 'zod';
import type { ConnectionManager } from './ConnectionManager';
import type { Logger } from 'pino';

export function createOperationTools(connectionManager: ConnectionManager, logger: Logger) {
  return {
    get_page_context: {
      name: 'get_page_context',
      description: '获取用户当前页面信息，返回页面类型、元素列表、可用操作（available_actions）。支持分页。',
      parameters: z.object({
        session_id: z.string()
          .describe('会话标识'),
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
          .default(50)
          .describe('每页元素数量'),
        offset: z.number()
          .optional()
          .default(0)
          .describe('分页偏移量'),
        container: z.string()
          .optional()
          .describe('容器选择器，限定扫描范围'),
      }),
      execute: async (params: {
        session_id: string;
        include_elements?: boolean;
        interactive_only?: boolean;
        max_elements?: number;
        offset?: number;
        container?: string;
      }) => {
        logger.info({ sessionId: params.session_id, offset: params.offset, container: params.container }, 'get_page_context called');

        if (!connectionManager.hasConnection(params.session_id)) {
          throw new Error('客户端未连接，请确保用户已打开AI助手');
        }

        const result = await connectionManager.sendRequest(
          params.session_id,
          'get_page_context',
          {
            include_elements: params.include_elements ?? true,
            interactive_only: params.interactive_only ?? false,
            max_elements: params.max_elements ?? 50,
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
