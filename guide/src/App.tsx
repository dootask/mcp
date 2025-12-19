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
  const isZh = useMemo(() => {
    const lang = new URLSearchParams(window.location.search).get('lang') ?? '';
    return /zh|cn/i.test(lang);
  }, []);
  const strings = useMemo(
    () =>
      isZh
        ? {
            title: 'MCP 使用指南',
            intro:
              '通过以下步骤，您可以在 Claude、fastmcp 等 MCP 客户端中安全接入 DooTask 数据。',
            section1Title: '1. 复制个人 Token',
            section1Desc: '点击下方按钮获取当前账号的 DooTask Token，并用于配置 MCP 客户端。',
            errorToken: '无法获取 Token',
            errorTokenDetail: '无法获取 Token，请确认已在 DooTask 插件环境内打开。',
            copyToken: '复制 Token',
            currentUser: '当前用户',
            unknownUser: '未知用户',
            unknown: '未知',
            tokenNotePrefix: 'Token 与当前账号权限一致，请妥善保管。当前账号：',
            tokenNoteSuffix: '，Token 过期时间：',
            tokenNoteEnd: '。',
            section2Title: '2. MCP 服务器地址',
            section2Desc: '所有客户端均通过反向代理地址接入：',
            copyAddress: '复制地址',
            section2NotePrefix: '地址基于当前页面自动生成，路径为 ',
            section2NoteSuffix: '，请保持相同协议与域名。',
            section3Title: '3. Cursor 客户端配置',
            section3Desc: '以下配置为 Cursor 示例，请在 ',
            section3DescSuffix: ' 中设置：',
            loadingConfig: '加载配置中...',
            copyConfig: '复制配置',
            section4Title: '4. Codex MCP 配置',
            section4Desc: '以 Linux/macOS 为例，在 ',
            section4DescSuffix: ' 中追加以下内容：',
            loadingToken: '加载中...',
            section5Title: '5. fastmcp CLI 示例',
            section5Desc: '在终端中执行以下命令测试 MCP 工具：',
            loadingCli: '加载命令示例中...',
            copyCommand: '复制命令',
            section6Title: '6. 其他 MCP 客户端',
            section6Desc: '若客户端支持自定义 MCP 服务器地址，可直接填写：',
            section7Title: '7. 常用工具示例',
            section7Desc: '以下提示可直接复制到 MCP 客户端，演示每个工具的典型用法：',
            section8Title: '8. 常见问题',
            faq1Prefix: '若提示缺少 Authorization 头，请确认客户端已设置 ',
            faq1Suffix: '。',
            faq2: 'Token 失效或权限不足时，可在此页面重新复制并更新客户端配置。',
            faq3: '所有操作权限与 Token 所属账号一致，请使用具备相应权限的账号。',
          }
        : {
            title: 'MCP Guide',
            intro:
              'Follow the steps below to securely connect DooTask data in Claude, fastmcp, and other MCP clients.',
            section1Title: '1. Copy Personal Token',
            section1Desc:
              'Click the button below to get your DooTask token for the current account and use it to configure your MCP client.',
            errorToken: 'Unable to fetch token',
            errorTokenDetail:
              'Unable to fetch token. Please make sure this page is opened inside the DooTask plugin environment.',
            copyToken: 'Copy Token',
            currentUser: 'Current user',
            unknownUser: 'Unknown user',
            unknown: 'Unknown',
            tokenNotePrefix:
              "The token inherits the current account's permissions. Keep it safe. Current account: ",
            tokenNoteSuffix: ', token expiration: ',
            tokenNoteEnd: '.',
            section2Title: '2. MCP Server URL',
            section2Desc: 'All clients connect through the reverse proxy URL:',
            copyAddress: 'Copy URL',
            section2NotePrefix: 'The URL is generated from this page with path ',
            section2NoteSuffix: '. Keep the same protocol and domain.',
            section3Title: '3. Cursor Client Setup',
            section3Desc: 'Use the following example in ',
            section3DescSuffix: ':',
            loadingConfig: 'Loading config...',
            copyConfig: 'Copy Config',
            section4Title: '4. Codex MCP Config',
            section4Desc: 'On Linux/macOS, append the following to ',
            section4DescSuffix: ':',
            loadingToken: 'Loading...',
            section5Title: '5. fastmcp CLI Example',
            section5Desc: 'Run the following command in your terminal to test the MCP tools:',
            loadingCli: 'Loading CLI example...',
            copyCommand: 'Copy Command',
            section6Title: '6. Other MCP Clients',
            section6Desc: 'If your client allows a custom MCP server URL, use:',
            section7Title: '7. Common Tool Examples',
            section7Desc:
              'Copy these prompts into your MCP client to see typical usage of each tool:',
            section8Title: '8. FAQ',
            faq1Prefix:
              'If you see a missing Authorization header error, ensure the client is set to ',
            faq1Suffix: '.',
            faq2:
              'If the token expires or lacks permissions, copy a new one here and update your client.',
            faq3:
              "All operations use the token account's permissions. Use an account with the required access.",
          },
    [isZh],
  );
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
            : strings.currentUser,
          tokenExpireAt: expireInfo?.data?.expired_at ?? null,
        });
        setState('ready');
      } catch (error) {
        console.error('Failed to load DooTask token', error);
        if (!mounted) return;
        setErrorMessage(strings.errorTokenDetail);
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
    () =>
      isZh
        ? [
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
          ]
        : [
            {
              title: 'User Management',
              items: [
                {
                  tool: 'get_users_basic',
                  prompt: 'Look up the nicknames and emails for user IDs 123 and 456.',
                },
                {
                  tool: 'search_user',
                  prompt: 'Search for Zhang San in the "Design" project and return their online status.',
                },
              ],
            },
            {
              title: 'Task Management',
              items: [
                {
                  tool: 'list_tasks',
                  prompt: 'List my incomplete tasks for this week and show their projects.',
                },
                {
                  tool: 'get_task',
                  prompt: 'View details and collaborators for task 1001.',
                },
                {
                  tool: 'create_task',
                  prompt: 'Create a task named "Write weekly report" in project 8, assigned to user 123.',
                },
                {
                  tool: 'update_task',
                  prompt: "Move task 120's deadline to next Friday and assign helper 456.",
                },
                {
                  tool: 'complete_task',
                  prompt: 'Mark task 88 as completed.',
                },
                {
                  tool: 'create_sub_task',
                  prompt: 'Add a subtask "Prepare meeting materials" to parent task 300.',
                },
                {
                  tool: 'get_task_files',
                  prompt: 'Show attachments for task 77.',
                },
                {
                  tool: 'delete_task',
                  prompt: 'Restore deleted task 66.',
                },
              ],
            },
            {
              title: 'Project Management',
              items: [
                {
                  tool: 'list_projects',
                  prompt: 'List all unarchived projects and show owners.',
                },
                {
                  tool: 'get_project',
                  prompt: 'View column configuration and member list for project 5.',
                },
                {
                  tool: 'create_project',
                  prompt:
                    'Create a project named "New Product Launch" and initialize columns "Planning, Execution, Done".',
                },
                {
                  tool: 'update_project',
                  prompt: 'Update project 9 description to "Key project for 2025".',
                },
              ],
            },
            {
              title: 'Notifications',
              items: [
                {
                  tool: 'send_message_to_user',
                  prompt: 'Send a Markdown message to user 200: "Please check the latest update on task 88".',
                },
                {
                  tool: 'get_message_list',
                  prompt: 'Search messages containing "daily report" in dialog 300.',
                },
              ],
            },
            {
              title: 'File Management',
              items: [
                {
                  tool: 'list_files',
                  prompt: 'Show my file list.',
                },
                {
                  tool: 'search_files',
                  prompt: 'Search for files related to "design draft" and return the top 10.',
                },
                {
                  tool: 'get_file_detail',
                  prompt: 'Show details for file 123.',
                },
              ],
            },
            {
              title: 'Reports',
              items: [
                {
                  tool: 'list_received_reports',
                  prompt: "List all reports I've received.",
                },
                {
                  tool: 'get_report_detail',
                  prompt: 'View details for report 456.',
                },
                {
                  tool: 'generate_report_template',
                  prompt: "Generate this week's report template.",
                },
                {
                  tool: 'create_report',
                  prompt: 'Create a report and send it to users 123 and 456.',
                },
                {
                  tool: 'list_my_reports',
                  prompt: "View all reports I've submitted and their read status.",
                },
                {
                  tool: 'mark_reports_read',
                  prompt: 'Mark report 789 as read.',
                },
              ],
            },
          ],
    [isZh],
  );

  if (state === 'loading') {
    return (
      <main className="page-loading">
        <div className="loading-indicator"></div>
      </main>
    );
  }

  return (
    <main>
      <h1>{strings.title}</h1>
      <p style={{ marginBottom: 24 }}>{strings.intro}</p>

      <section>
        <h2>{strings.section1Title}</h2>
        <p>{strings.section1Desc}</p>
        <div className="info-box">
          <span className="info-value">
            {state === 'error' && strings.errorToken}
            {state === 'ready' && data?.token}
          </span>
          {state === 'ready' && data ? (
            <div className="info-actions">
              <CopyButton value={data.token} label={strings.copyToken} />
            </div>
          ) : null}
        </div>
        <p className="note">
          {strings.tokenNotePrefix}
          {data?.userLabel || strings.unknownUser}
          {strings.tokenNoteSuffix}
          {data?.tokenExpireAt || strings.unknown}
          {strings.tokenNoteEnd}
        </p>
        {state === 'error' && <p className="status error">{errorMessage}</p>}
      </section>

      <section>
        <h2>{strings.section2Title}</h2>
        <p>{strings.section2Desc}</p>
        <div className="info-box">
          <span className="info-value">{mcpUrl}</span>
          <div className="info-actions">
            <CopyButton value={mcpUrl} label={strings.copyAddress} />
          </div>
        </div>
        <p className="note">
          {strings.section2NotePrefix}
          <code>/apps/mcp_server/mcp</code>
          {strings.section2NoteSuffix}
        </p>
      </section>

      <section>
        <h2>{strings.section3Title}</h2>
        <p>
          {strings.section3Desc}
          <code>.cursor/mcp.json</code>
          {strings.section3DescSuffix}
        </p>
        <div className="info-box code-box">
          <pre className="info-value code-content">
            <code>{claudeConfig || strings.loadingConfig}</code>
          </pre>
          {claudeConfig ? (
            <div className="info-actions">
              <CopyButton value={claudeConfig} label={strings.copyConfig} />
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2>{strings.section4Title}</h2>
        <p>
          {strings.section4Desc}
          <code>~/.codex/config.toml</code>
          {strings.section4DescSuffix}
        </p>
        <div className="info-box code-box">
          <pre className="info-value code-content">
            <code>{`[mcp_servers.DooTask]
url = "${mcpUrl}"
http_headers = { "Authorization" = "Bearer ${data?.token || strings.loadingToken}" }`}</code>
          </pre>
          {data?.token ? (
            <div className="info-actions">
              <CopyButton
                value={`[mcp_servers.DooTask]
url = "${mcpUrl}"
                http_headers = { "Authorization" = "Bearer ${data.token}" }`}
                label={strings.copyConfig}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2>{strings.section5Title}</h2>
        <p>{strings.section5Desc}</p>
        <div className="info-box code-box">
          <pre className="info-value code-content">
            <code>{cliSnippet || strings.loadingCli}</code>
          </pre>
          {cliSnippet ? (
            <div className="info-actions">
              <CopyButton value={cliSnippet} label={strings.copyCommand} />
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2>{strings.section6Title}</h2>
        <p>{strings.section6Desc}</p>
        <div className="info-box">
          <span className="info-value">{`${mcpUrl}?token=${data?.token || strings.loadingToken}`}</span>
          <div className="info-actions">
            <CopyButton
              value={`${mcpUrl}?token=${data?.token || strings.loadingToken}`}
              label={strings.copyAddress}
            />
          </div>
        </div>
      </section>

      <section>
        <h2>{strings.section7Title}</h2>
        <p>{strings.section7Desc}</p>
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
        <h2>{strings.section8Title}</h2>
        <ul>
          <li>
            {strings.faq1Prefix}
            <code>Authorization: Bearer {'<Token>'}</code>
            {strings.faq1Suffix}
          </li>
          <li>{strings.faq2}</li>
          <li>{strings.faq3}</li>
        </ul>
      </section>
    </main>
  );
}
