import { useEffect, useMemo, useState } from 'react';
import { appReady, getUserToken, getUserInfo } from '@dootask/tools';
import { CopyButton } from './components/CopyButton';

type LoadState = 'loading' | 'ready' | 'error';

interface GuideData {
  token: string;
  userLabel: string;
}

export default function App() {
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<GuideData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        await appReady();
        const [token, user] = await Promise.all([
          getUserToken(),
          getUserInfo().catch(() => null),
        ]);

        if (!mounted) return;

        setData({
          token,
          userLabel: user
            ? `${user.nickname || user.username || user.userid}`
            : '当前用户',
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
    const url = new URL('/mcp', window.location.href);
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

  return (
    <main>
      <h1>DooTask MCP 使用指南</h1>
      <p style={{ marginBottom: 24 }}>
        通过以下步骤，您可以在 Claude、fastmcp 等 MCP 客户端中安全接入 DooTask 数据。
      </p>

      <section>
        <h2>1. 复制个人 Token</h2>
        <p>点击下方按钮获取当前账号的 DooTask Token，并用于配置 MCP 客户端。</p>
        <div className="info-box" style={{ justifyContent: 'space-between' }}>
          <span>
            {state === 'loading' && '获取中…'}
            {state === 'error' && '无法获取 Token'}
            {state === 'ready' && data?.token}
          </span>
          {state === 'ready' && data ? <CopyButton value={data.token} label="复制 Token" /> : null}
        </div>
        <p className="note">
          Token 与当前账号权限一致，请妥善保管。当前账号：{data?.userLabel || '未知用户'}
        </p>
        {state === 'error' && <p className="status error">{errorMessage}</p>}
      </section>

      <section>
        <h2>2. MCP 服务器地址</h2>
        <p>所有客户端使用同一地址接入：</p>
        <div className="info-box" style={{ justifyContent: 'space-between' }}>
          <span>{mcpUrl}</span>
          <CopyButton value={mcpUrl} label="复制地址" />
        </div>
        <p className="note">地址基于当前页面自动生成，请保持相同协议与域名。</p>
      </section>

      <section>
        <h2>3. Claude 客户端配置</h2>
        <p>在 Claude 桌面客户端的 <code>config.json</code> 中追加以下内容：</p>
        <pre>
          <code>{claudeConfig || '加载配置中…'}</code>
        </pre>
      </section>

      <section>
        <h2>4. fastmcp CLI 示例</h2>
        <p>在终端中执行以下命令测试 MCP 工具：</p>
        <pre>
          <code>{cliSnippet || '加载命令示例中…'}</code>
        </pre>
      </section>

      <section>
        <h2>5. 常见问题</h2>
        <ul>
          <li>若提示缺少 Authorization 头，请确认客户端已设置 <code>Authorization: Bearer {'<Token>'}</code>。</li>
          <li>Token 失效或权限不足时，可在此页面重新复制并更新客户端配置。</li>
          <li>所有操作权限与 Token 所属账号一致，请使用具备相应权限的账号。</li>
        </ul>
      </section>
    </main>
  );
}
