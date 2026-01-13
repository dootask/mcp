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

type ClientType = 'claude-code' | 'cursor' | 'vscode' | 'windsurf' | 'claude-desktop' | 'codex' | 'kiro' | 'trae' | 'antigravity' | 'opencode' | 'other';

const CLIENT_TABS: { key: ClientType; label: string }[] = [
  { key: 'claude-code', label: 'Claude Code' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'vscode', label: 'VS Code' },
  { key: 'windsurf', label: 'Windsurf' },
  { key: 'claude-desktop', label: 'Claude Desktop' },
  { key: 'codex', label: 'Codex' },
  { key: 'kiro', label: 'Kiro' },
  { key: 'trae', label: 'Trae' },
  { key: 'antigravity', label: 'Antigravity' },
  { key: 'opencode', label: 'Opencode' },
  { key: 'other', label: '' }, // label will be set dynamically
];

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
            intro: '通过以下步骤，您可以在各种 AI 工具中安全接入 DooTask 数据。',
            section1Title: '1. 复制个人 Token',
            section1Desc: '点击下方按钮获取当前账号的 DooTask Token，用于配置 MCP 客户端。',
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
            section2Desc: '所有客户端均通过以下地址接入：',
            copyAddress: '复制地址',
            section3Title: '3. 接入配置',
            section3Desc: '选择你的 AI 工具，复制对应配置：',
            copy: '复制',
            copyConfig: '复制配置',
            other: '其他',
            // Client hints
            hintClaudeCode: '在终端运行以下命令：',
            hintCursor: '编辑配置文件：',
            hintVSCode: '编辑配置文件：',
            hintWindsurf: '编辑 MCP 配置文件：',
            hintClaudeDesktop: '编辑配置文件：',
            hintCodex: '编辑 TOML 配置文件：',
            hintKiro: '通过 Kiro > MCP Servers > Add 添加，或编辑配置文件：',
            hintTrae: '手动添加 JSON 配置：',
            hintAntigravity: '编辑 MCP 配置文件：',
            hintOpencode: '编辑配置文件中的 mcp 字段：',
            hintOther: '对于其他支持 MCP 的工具，只需在配置中添加以下信息：',
            hintOtherJson: '通用 JSON 配置格式：',
            section4Title: '4. 使用示例',
            section4Desc: '配置生效后，即可通过自然语言与 AI 对话操作 DooTask：',
            // Example categories
            catTask: '任务管理',
            catProject: '项目查询',
            catReport: '工作汇报',
            catTeam: '团队协作',
            catFile: '文件查找',
            section5Title: '5. 常见问题',
            faq1Prefix: '若提示缺少 Authorization 头，请确认客户端已设置 ',
            faq1Suffix: '。',
            faq2: 'Token 失效或权限不足时，可在此页面重新复制并更新客户端配置。',
            faq3: '所有操作权限与 Token 所属账号一致，请使用具备相应权限的账号。',
          }
        : {
            title: 'MCP Guide',
            intro: 'Follow the steps below to securely connect DooTask data in various AI tools.',
            section1Title: '1. Copy Personal Token',
            section1Desc: 'Click the button below to get your DooTask token for the current account.',
            errorToken: 'Unable to fetch token',
            errorTokenDetail: 'Unable to fetch token. Please make sure this page is opened inside the DooTask plugin environment.',
            copyToken: 'Copy Token',
            currentUser: 'Current user',
            unknownUser: 'Unknown user',
            unknown: 'Unknown',
            tokenNotePrefix: "The token inherits the current account's permissions. Keep it safe. Current account: ",
            tokenNoteSuffix: ', token expiration: ',
            tokenNoteEnd: '.',
            section2Title: '2. MCP Server URL',
            section2Desc: 'All clients connect through the following URL:',
            copyAddress: 'Copy URL',
            section3Title: '3. Configuration',
            section3Desc: 'Choose your AI tool and copy the configuration:',
            copy: 'Copy',
            copyConfig: 'Copy Config',
            other: 'Other',
            // Client hints
            hintClaudeCode: 'Run the following command in terminal:',
            hintCursor: 'Edit config file:',
            hintVSCode: 'Edit config file:',
            hintWindsurf: 'Edit MCP config file:',
            hintClaudeDesktop: 'Edit config file:',
            hintCodex: 'Edit TOML config file:',
            hintKiro: 'Add via Kiro > MCP Servers > Add, or edit config file:',
            hintTrae: 'Manually add JSON configuration:',
            hintAntigravity: 'Edit MCP config file:',
            hintOpencode: 'Edit the mcp field in config file:',
            hintOther: 'For other MCP-compatible tools, simply add the following info:',
            hintOtherJson: 'Generic JSON configuration format:',
            section4Title: '4. Usage Examples',
            section4Desc: 'After configuration, you can interact with DooTask through natural language:',
            // Example categories
            catTask: 'Task Management',
            catProject: 'Project Query',
            catReport: 'Work Reports',
            catTeam: 'Team Collaboration',
            catFile: 'File Search',
            section5Title: '5. FAQ',
            faq1Prefix: 'If you see a missing Authorization header error, ensure the client is set to ',
            faq1Suffix: '.',
            faq2: 'If the token expires or lacks permissions, copy a new one here and update your client.',
            faq3: "All operations use the token account's permissions. Use an account with the required access.",
          },
    [isZh],
  );

  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<GuideData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [activeClient, setActiveClient] = useState<ClientType>('claude-code');

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

  // Generate configs for each client
  const configs = useMemo(() => {
    const token = data?.token || '<YOUR_TOKEN>';

    return {
      'claude-code': `claude mcp add --transport http DooTask ${mcpUrl} --header "Authorization: Bearer ${token}"`,

      cursor: JSON.stringify({
        mcpServers: {
          DooTask: {
            url: mcpUrl,
            headers: { Authorization: `Bearer ${token}` }
          }
        }
      }, null, 2),

      vscode: JSON.stringify({
        mcp: {
          servers: {
            DooTask: {
              type: "http",
              url: mcpUrl,
              headers: { Authorization: `Bearer ${token}` }
            }
          }
        }
      }, null, 2),

      windsurf: JSON.stringify({
        mcpServers: {
          DooTask: {
            serverUrl: mcpUrl,
            headers: { Authorization: `Bearer ${token}` }
          }
        }
      }, null, 2),

      'claude-desktop': JSON.stringify({
        mcpServers: {
          DooTask: {
            type: "streamable-http",
            url: mcpUrl,
            headers: { Authorization: `Bearer ${token}` }
          }
        }
      }, null, 2),

      codex: `[mcp_servers.DooTask]\nurl = "${mcpUrl}"\nhttp_headers = { "Authorization" = "Bearer ${token}" }`,

      kiro: JSON.stringify({
        mcpServers: {
          DooTask: {
            type: "streamable-http",
            url: mcpUrl,
            headers: { Authorization: `Bearer ${token}` }
          }
        }
      }, null, 2),

      trae: JSON.stringify({
        mcpServers: {
          DooTask: {
            url: mcpUrl,
            headers: { Authorization: `Bearer ${token}` }
          }
        }
      }, null, 2),

      antigravity: JSON.stringify({
        mcpServers: {
          DooTask: {
            serverUrl: mcpUrl,
            headers: { Authorization: `Bearer ${token}` }
          }
        }
      }, null, 2),

      opencode: JSON.stringify({
        mcp: {
          DooTask: {
            type: "remote",
            url: mcpUrl,
            headers: { Authorization: `Bearer ${token}` },
            enabled: true
          }
        }
      }, null, 2),

      other: JSON.stringify({
        mcpServers: {
          DooTask: {
            url: mcpUrl,
            headers: { Authorization: `Bearer ${token}` }
          }
        }
      }, null, 2),
    };
  }, [data, mcpUrl]);

  const clientHints: Record<ClientType, { hint: string; path?: string }> = useMemo(() => ({
    'claude-code': { hint: strings.hintClaudeCode },
    cursor: { hint: strings.hintCursor, path: '~/.cursor/mcp.json' },
    vscode: { hint: strings.hintVSCode, path: 'settings.json' },
    windsurf: { hint: strings.hintWindsurf },
    'claude-desktop': { hint: strings.hintClaudeDesktop },
    codex: { hint: strings.hintCodex, path: '~/.codex/config.toml' },
    kiro: { hint: strings.hintKiro },
    trae: { hint: strings.hintTrae },
    antigravity: { hint: strings.hintAntigravity },
    opencode: { hint: strings.hintOpencode },
    other: { hint: strings.hintOther },
  }), [strings]);

  // Usage examples matching MCPHelper.vue
  const usageExamples = useMemo(() => isZh ? [
    {
      category: strings.catTask,
      items: [
        '我今天有哪些任务？',
        '本周还有多少未完成的任务？',
        '帮我把任务"修复登录bug"标记完成',
        '创建一个任务：设计用户中心页面',
        '给任务添加子任务：编写单元测试',
        '把任务截止时间改为下周五',
      ]
    },
    {
      category: strings.catProject,
      items: [
        '我参与了哪些项目？',
        '电商项目目前进展如何？',
        '项目里还有多少未完成任务？',
        '项目成员有哪些人？',
      ]
    },
    {
      category: strings.catReport,
      items: [
        '帮我生成今天的日报',
        '帮我写本周周报',
        '我上周提交过周报吗？',
        '张三上个月的周报情况怎么样？',
      ]
    },
    {
      category: strings.catTeam,
      items: [
        '发消息给张三：明天会议改到下午3点',
        '搜索关于"接口设计"的聊天记录',
        '帮我找一下李四的联系方式',
      ]
    },
    {
      category: strings.catFile,
      items: [
        '帮我找一下需求文档',
        '我的文件列表有哪些？',
        '这个任务有哪些附件？',
      ]
    },
  ] : [
    {
      category: strings.catTask,
      items: [
        'What tasks do I have today?',
        'How many uncompleted tasks do I have this week?',
        'Mark the task "Fix login bug" as completed',
        'Create a task: Design user center page',
        'Add a subtask: Write unit tests',
        'Change the task deadline to next Friday',
      ]
    },
    {
      category: strings.catProject,
      items: [
        'What projects am I involved in?',
        'How is the e-commerce project progressing?',
        'How many uncompleted tasks are in the project?',
        'Who are the project members?',
      ]
    },
    {
      category: strings.catReport,
      items: [
        'Generate my daily report for today',
        'Write my weekly report',
        'Did I submit a weekly report last week?',
        "How was Zhang San's weekly reports last month?",
      ]
    },
    {
      category: strings.catTeam,
      items: [
        "Send a message to Zhang San: Tomorrow's meeting is rescheduled to 3 PM",
        'Search chat history about "API design"',
        "Help me find Li Si's contact info",
      ]
    },
    {
      category: strings.catFile,
      items: [
        'Help me find the requirements document',
        'What files do I have?',
        'What attachments does this task have?',
      ]
    },
  ], [isZh, strings]);

  if (state === 'loading') {
    return (
      <main className="page-loading">
        <div className="loading-indicator"></div>
      </main>
    );
  }

  const tabs = CLIENT_TABS.map(tab =>
    tab.key === 'other' ? { ...tab, label: strings.other } : tab
  );

  return (
    <main>
      <h1>{strings.title}</h1>
      <p style={{ marginBottom: 24 }}>{strings.intro}</p>

      {/* Section 1: Token */}
      <section>
        <h2>{strings.section1Title}</h2>
        <p>{strings.section1Desc}</p>
        <div className="info-box">
          <span className="info-value code-content">
            {state === 'error' && <code>{strings.errorToken}</code>}
            {state === 'ready' && <code>{data?.token}</code>}
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

      {/* Section 2: MCP URL */}
      <section>
        <h2>{strings.section2Title}</h2>
        <p>{strings.section2Desc}</p>
        <div className="info-box">
          <span className="info-info-value code-content">
            <code>{mcpUrl}</code>
          </span>
          <div className="info-actions">
            <CopyButton value={mcpUrl} label={strings.copyAddress} />
          </div>
        </div>
      </section>

      {/* Section 3: Client Configurations */}
      <section>
        <h2>{strings.section3Title}</h2>
        <p>{strings.section3Desc}</p>

        <div className="client-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`client-tab ${activeClient === tab.key ? 'active' : ''}`}
              onClick={() => setActiveClient(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="client-config">
          <p className="config-hint">
            {clientHints[activeClient].hint}
            {clientHints[activeClient].path && (
              <code>{clientHints[activeClient].path}</code>
            )}
          </p>

          {activeClient === 'claude-desktop' && (
            <p className="config-paths">
              <code>macOS: ~/Library/Application Support/Claude/claude_desktop_config.json</code>
              <br />
              <code>Windows: %APPDATA%\Claude\claude_desktop_config.json</code>
            </p>
          )}

          <div className="info-box code-box">
            <pre className="info-value code-content">
              <code>{configs[activeClient]}</code>
            </pre>
            <div className="info-actions">
              <CopyButton value={configs[activeClient]} label={strings.copy} />
            </div>
          </div>

        </div>
      </section>

      {/* Section 4: Usage Examples */}
      <section>
        <h2>{strings.section4Title}</h2>
        <p>{strings.section4Desc}</p>
        <div className="examples-grid">
          {usageExamples.map((group) => (
            <div key={group.category} className="examples-card">
              <h3>{group.category}</h3>
              <ul>
                {group.items.map((item, idx) => (
                  <li key={idx}>"{item}"</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Section 5: FAQ */}
      <section>
        <h2>{strings.section5Title}</h2>
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
