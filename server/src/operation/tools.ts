import { z } from 'zod';
import type { ConnectionManager } from './ConnectionManager';
import type { Logger } from 'pino';

export function createOperationTools(connectionManager: ConnectionManager, logger: Logger) {
  return {
    get_page_context: {
      name: 'get_page_context',
      description: '获取用户当前页面的上下文信息，包括页面类型、业务数据、可交互元素。需要用户已打开 AI 助手并建立连接。',
      parameters: z.object({
        session_id: z.string().describe('前端 WebSocket 连接标识'),
        include_elements: z.boolean().optional().default(true).describe('是否返回可交互元素列表'),
      }),
      execute: async (params: { session_id: string; include_elements?: boolean }) => {
        logger.info({ sessionId: params.session_id }, 'get_page_context called');

        if (!connectionManager.hasConnection(params.session_id)) {
          throw new Error('客户端未连接，请确保用户已打开 AI 助手');
        }

        const result = await connectionManager.sendRequest(
          params.session_id,
          'get_page_context',
          { include_elements: params.include_elements ?? true },
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
      description: '执行业务级操作，如打开任务、编辑表单、切换视图等。需要用户已打开 AI 助手并建立连接。',
      parameters: z.object({
        session_id: z.string().describe('前端 WebSocket 连接标识'),
        action: z.string().describe('操作名称，从 get_page_context 返回的 available_actions 中选择'),
        params: z.record(z.unknown()).optional().describe('操作参数'),
      }),
      execute: async (params: { session_id: string; action: string; params?: Record<string, unknown> }) => {
        logger.info({ sessionId: params.session_id, action: params.action }, 'execute_action called');

        if (!connectionManager.hasConnection(params.session_id)) {
          throw new Error('客户端未连接，请确保用户已打开 AI 助手');
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
      description: '直接操作页面元素，作为业务操作的兜底方案。需要用户已打开 AI 助手并建立连接。',
      parameters: z.object({
        session_id: z.string().describe('前端 WebSocket 连接标识'),
        element_uid: z.string().describe('元素标识，从 get_page_context 返回的 elements 列表获取'),
        action: z.enum(['click', 'type', 'select', 'focus', 'scroll']).describe('操作类型'),
        value: z.string().optional().describe('type/select 操作时的值'),
      }),
      execute: async (params: { session_id: string; element_uid: string; action: string; value?: string }) => {
        logger.info({ sessionId: params.session_id, elementUid: params.element_uid, action: params.action }, 'execute_element_action called');

        if (!connectionManager.hasConnection(params.session_id)) {
          throw new Error('客户端未连接，请确保用户已打开 AI 助手');
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
