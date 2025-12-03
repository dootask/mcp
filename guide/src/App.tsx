import { useEffect, useMemo, useState } from 'react';
import {
  appReady,
  getUserToken,
  getUserInfo,
  requestAPI,
  getSafeArea,
} from '@dootask/tools';
import { CopyButton } from './components/CopyButton';

type LoadState = 'loading' | 'ready' | 'error';

interface GuideData {
  token: string;
  userLabel: string;
  tokenExpireAt: string | null;
}

export default function App() {
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<GuideData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get('theme');
    const resolvedTheme = themeParam === 'dark' ? 'dark' : 'light';
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    return () => {
      root.removeAttribute('data-theme');
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        await appReady();
        const [token, user, expireInfo, safe] = await Promise.all([
          getUserToken(),
          getUserInfo().catch(() => null),
          requestAPI({ url: 'users/token/expire' }).catch(() => null),
          getSafeArea().catch(() => ({ top: 0, bottom: 0 })),
        ]);

        if (!mounted) return;

        const root = document.documentElement;
        root.style.setProperty('--safe-top', `${safe?.top ?? 0}px`);
        root.style.setProperty('--safe-bottom', `${safe?.bottom ?? 0}px`);

        setData({
          token,
          userLabel: user
            ? `${user.nickname || user.username || user.userid}`
            : '当前用户',
          tokenExpireAt: expireInfo?.data?.expired_at ?? null,
        });
        setState('ready');
      } catch (error) {
        console.error('Failed to load DooTask token', error);
        if (!mounted) return;
        setErrorMessage('无法获取 Token，请确认已在 DooTask 插件环境内打开。');
        setState('error');
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const mcpUrl = useMemo(() => {
    const url = new URL('/apps/mcp_server/mcp', window.location.href);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }, []);

  const claudeConfig = useMemo(() => {
    if (!data) return '';
    return JSON.stringify(
      {
        mcpServers: {
          DooTask: {
            url: mcpUrl,
            description: 'DooTask MCP Server',
            type: 'streamable-http',
            headers: {
              Authorization: `Bearer ${data.token}`,
            },
          },
        },
      },
      null,
      2,
    );
  }, [data, mcpUrl]);

  const cliSnippet = useMemo(() => {
    if (!data) return '';
    return [
      `export DOOTASK_TOKEN="${data.token}"`,
      'npx fastmcp-client http \\',
      '  --header "Authorization: Bearer \\${DOOTASK_TOKEN}" \\',
      `  ${mcpUrl}`,
    ].join('\n');
  }, [data, mcpUrl]);

  const toolExamples = useMemo(
    () => [
      {
        title: '用户管理',
        items: [
          {
            tool: 'get_users_basic',
            prompt: '请根据用户ID 123 和 456 查询他们的昵称和邮箱。',
          },
          {
            tool: 'search_user',
            prompt: '搜索“设计”项目里的张三，返回他的在线状态。',
          },
        ],
      },
      {
        title: '任务管理',
        items: [
          {
            tool: 'list_tasks',
            prompt: '列出我本周未完成的任务，并显示所属项目。',
          },
          {
            tool: 'get_task',
            prompt: '查看任务 1001 的详情和协作人员。',
          },
          {
            tool: 'create_task',
            prompt: '在项目 8 中创建名为“撰写周报”的任务，负责人是用户 123。',
          },
          {
            tool: 'update_task',
            prompt: '把任务 120 的截止时间改到下周五，并指派协助人 456。',
          },
          {
            tool: 'complete_task',
            prompt: '将任务 88 标记为已完成。',
          },
          {
            tool: 'create_sub_task',
            prompt: '为主任务 300 新增子任务“准备会议材料”。',
          },
          {
            tool: 'get_task_files',
            prompt: '查看任务 77 的附件列表。',
          },
          {
            tool: 'delete_task',
            prompt: '恢复被删除的任务 66。',
          },
        ],
      },
      {
        title: '项目管理',
        items: [
          {
            tool: 'list_projects',
            prompt: '列出所有未归档项目并显示负责人。',
          },
          {
            tool: 'get_project',
            prompt: '查看项目 5 的列配置和成员列表。',
          },
          {
            tool: 'create_project',
            prompt: '创建名为“新品发布”的项目，并初始化“规划,执行,完成”三列。',
          },
          {
            tool: 'update_project',
            prompt: '把项目 9 的描述改为“2025 年关键项目”。',
          },
        ],
      },
      {
        title: '消息通知',
        items: [
          {
            tool: 'send_message_to_user',
            prompt: '给用户 200 发送 Markdown 消息"请查看任务 88 的最新更新"。',
          },
          {
            tool: 'get_message_list',
            prompt: '在对话 300 中搜索包含"日报"的消息。',
          },
        ],
      },
      {
        title: '文件管理',
        items: [
          {
            tool: 'list_files',
            prompt: '查看我的文件列表。',
          },
          {
            tool: 'search_files',
            prompt: '搜索关键词"设计稿"相关的文件，返回前 10 条。',
          },
          {
            tool: 'get_file_detail',
            prompt: '显示文件123的详细信息。',
          },
        ],
      },
      {
        title: '工作报告',
        items: [
          {
            tool: 'list_received_reports',
            prompt: '列出我收到的所有工作报告。',
          },
          {
            tool: 'get_report_detail',
            prompt: '查看报告 456 的详细内容。',
          },
          {
            tool: 'generate_report_template',
            prompt: '生成本周的工作报告模板。',
          },
          {
            tool: 'create_report',
            prompt: '创建一份工作报告，接收人是用户 123 和 456。',
          },
          {
            tool: 'list_my_reports',
            prompt: '查看我提交的所有工作报告及阅读状态。',
          },
          {
            tool: 'mark_reports_read',
            prompt: '将报告 789 标记为已读。',
          },
        ],
      },
    ],
    [],
  );

  return (
    <main>
      <h1>MCP 使用指南</h1>
      <p style={{ marginBottom: 24 }}>
        通过以下步骤，您可以在 Claude、fastmcp 等 MCP 客户端中安全接入 DooTask 数据。
      </p>

      <section>
        <h2>1. 复制个人 Token</h2>
        <p>点击下方按钮获取当前账号的 DooTask Token，并用于配置 MCP 客户端。</p>
        <div className="info-box">
          <span className="info-value">
            {state === 'loading' && '获取中…'}
            {state === 'error' && '无法获取 Token'}
            {state === 'ready' && data?.token}
          </span>
          {state === 'ready' && data ? (
            <div className="info-actions">
              <CopyButton value={data.token} label="复制 Token" />
            </div>
          ) : null}
        </div>
        <p className="note">
          Token 与当前账号权限一致，请妥善保管。当前账号：{data?.userLabel || '未知用户'}
          ，Token 过期时间：{data?.tokenExpireAt || '未知'}。
        </p>
        {state === 'error' && <p className="status error">{errorMessage}</p>}
      </section>

      <section>
        <h2>2. MCP 服务器地址</h2>
        <p>所有客户端均通过反向代理地址接入：</p>
        <div className="info-box">
          <span className="info-value">{mcpUrl}</span>
          <div className="info-actions">
            <CopyButton value={mcpUrl} label="复制地址" />
          </div>
        </div>
        <p className="note">
          地址基于当前页面自动生成，路径为 <code>/apps/mcp_server/mcp</code>，请保持相同协议与域名。
        </p>
      </section>

      <section>
        <h2>3. Claude 客户端配置</h2>
        <p>在 Claude 桌面客户端的 <code>config.json</code> 中追加以下内容：</p>
        <div className="info-box code-box">
          <pre className="info-value code-content">
            <code>{claudeConfig || '加载配置中…'}</code>
          </pre>
          {claudeConfig ? (
            <div className="info-actions">
              <CopyButton value={claudeConfig} label="复制配置" />
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2>4. fastmcp CLI 示例</h2>
        <p>在终端中执行以下命令测试 MCP 工具：</p>
        <div className="info-box code-box">
          <pre className="info-value code-content">
            <code>{cliSnippet || '加载命令示例中…'}</code>
          </pre>
          {cliSnippet ? (
            <div className="info-actions">
              <CopyButton value={cliSnippet} label="复制命令" />
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2>5. 常用工具示例</h2>
        <p>以下提示可直接复制到 MCP 客户端，演示每个工具的典型用法：</p>
        <div className="examples-grid">
          {toolExamples.map((group) => (
            <div key={group.title} className="examples-card">
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.tool}>
                    <span className="tool-name">{item.tool}</span>
                    <p>{item.prompt}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>6. 常见问题</h2>
        <ul>
          <li>若提示缺少 Authorization 头，请确认客户端已设置 <code>Authorization: Bearer {'<Token>'}</code>。</li>
          <li>Token 失效或权限不足时，可在此页面重新复制并更新客户端配置。</li>
          <li>所有操作权限与 Token 所属账号一致，请使用具备相应权限的账号。</li>
        </ul>
      </section>
    </main>
  );
}
