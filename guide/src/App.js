import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { appReady, getUserToken, getUserInfo } from '@dootask/tools';
import { CopyButton } from './components/CopyButton';
export default function App() {
    const [state, setState] = useState('loading');
    const [data, setData] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                await appReady();
                const [token, user] = await Promise.all([
                    getUserToken(),
                    getUserInfo().catch(() => null),
                ]);
                if (!mounted)
                    return;
                setData({
                    token,
                    userLabel: user
                        ? `${user.nickname || user.username || user.userid}`
                        : '当前用户',
                });
                setState('ready');
            }
            catch (error) {
                console.error('Failed to load DooTask token', error);
                if (!mounted)
                    return;
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
        if (!data)
            return '';
        return JSON.stringify({
            mcpServers: {
                DooTask: {
                    url: mcpUrl,
                    description: 'DooTask MCP Server',
                    headers: {
                        Authorization: `Bearer ${data.token}`,
                    },
                },
            },
        }, null, 2);
    }, [data, mcpUrl]);
    const cliSnippet = useMemo(() => {
        if (!data)
            return '';
        return [
            `export DOOTASK_TOKEN="${data.token}"`,
            'npx fastmcp-client http \\',
            '  --header "Authorization: Bearer \\${DOOTASK_TOKEN}" \\',
            `  ${mcpUrl}`,
        ].join('\n');
    }, [data, mcpUrl]);
    return (_jsxs("main", { children: [_jsx("h1", { children: "DooTask MCP \u4F7F\u7528\u6307\u5357" }), _jsx("p", { style: { marginBottom: 24 }, children: "\u901A\u8FC7\u4EE5\u4E0B\u6B65\u9AA4\uFF0C\u60A8\u53EF\u4EE5\u5728 Claude\u3001fastmcp \u7B49 MCP \u5BA2\u6237\u7AEF\u4E2D\u5B89\u5168\u63A5\u5165 DooTask \u6570\u636E\u3002" }), _jsxs("section", { children: [_jsx("h2", { children: "1. \u590D\u5236\u4E2A\u4EBA Token" }), _jsx("p", { children: "\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u83B7\u53D6\u5F53\u524D\u8D26\u53F7\u7684 DooTask Token\uFF0C\u5E76\u7528\u4E8E\u914D\u7F6E MCP \u5BA2\u6237\u7AEF\u3002" }), _jsxs("div", { className: "info-box", style: { justifyContent: 'space-between' }, children: [_jsxs("span", { children: [state === 'loading' && '获取中…', state === 'error' && '无法获取 Token', state === 'ready' && data?.token] }), state === 'ready' && data ? _jsx(CopyButton, { value: data.token, label: "\u590D\u5236 Token" }) : null] }), _jsxs("p", { className: "note", children: ["Token \u4E0E\u5F53\u524D\u8D26\u53F7\u6743\u9650\u4E00\u81F4\uFF0C\u8BF7\u59A5\u5584\u4FDD\u7BA1\u3002\u5F53\u524D\u8D26\u53F7\uFF1A", data?.userLabel || '未知用户'] }), state === 'error' && _jsx("p", { className: "status error", children: errorMessage })] }), _jsxs("section", { children: [_jsx("h2", { children: "2. MCP \u670D\u52A1\u5668\u5730\u5740" }), _jsx("p", { children: "\u6240\u6709\u5BA2\u6237\u7AEF\u4F7F\u7528\u540C\u4E00\u5730\u5740\u63A5\u5165\uFF1A" }), _jsxs("div", { className: "info-box", style: { justifyContent: 'space-between' }, children: [_jsx("span", { children: mcpUrl }), _jsx(CopyButton, { value: mcpUrl, label: "\u590D\u5236\u5730\u5740" })] }), _jsx("p", { className: "note", children: "\u5730\u5740\u57FA\u4E8E\u5F53\u524D\u9875\u9762\u81EA\u52A8\u751F\u6210\uFF0C\u8BF7\u4FDD\u6301\u76F8\u540C\u534F\u8BAE\u4E0E\u57DF\u540D\u3002" })] }), _jsxs("section", { children: [_jsx("h2", { children: "3. Claude \u5BA2\u6237\u7AEF\u914D\u7F6E" }), _jsxs("p", { children: ["\u5728 Claude \u684C\u9762\u5BA2\u6237\u7AEF\u7684 ", _jsx("code", { children: "config.json" }), " \u4E2D\u8FFD\u52A0\u4EE5\u4E0B\u5185\u5BB9\uFF1A"] }), _jsx("pre", { children: _jsx("code", { children: claudeConfig || '加载配置中…' }) })] }), _jsxs("section", { children: [_jsx("h2", { children: "4. fastmcp CLI \u793A\u4F8B" }), _jsx("p", { children: "\u5728\u7EC8\u7AEF\u4E2D\u6267\u884C\u4EE5\u4E0B\u547D\u4EE4\u6D4B\u8BD5 MCP \u5DE5\u5177\uFF1A" }), _jsx("pre", { children: _jsx("code", { children: cliSnippet || '加载命令示例中…' }) })] }), _jsxs("section", { children: [_jsx("h2", { children: "5. \u5E38\u89C1\u95EE\u9898" }), _jsxs("ul", { children: [_jsxs("li", { children: ["\u82E5\u63D0\u793A\u7F3A\u5C11 Authorization \u5934\uFF0C\u8BF7\u786E\u8BA4\u5BA2\u6237\u7AEF\u5DF2\u8BBE\u7F6E ", _jsxs("code", { children: ["Authorization: Bearer ", '<Token>'] }), "\u3002"] }), _jsx("li", { children: "Token \u5931\u6548\u6216\u6743\u9650\u4E0D\u8DB3\u65F6\uFF0C\u53EF\u5728\u6B64\u9875\u9762\u91CD\u65B0\u590D\u5236\u5E76\u66F4\u65B0\u5BA2\u6237\u7AEF\u914D\u7F6E\u3002" }), _jsx("li", { children: "\u6240\u6709\u64CD\u4F5C\u6743\u9650\u4E0E Token \u6240\u5C5E\u8D26\u53F7\u4E00\u81F4\uFF0C\u8BF7\u4F7F\u7528\u5177\u5907\u76F8\u5E94\u6743\u9650\u7684\u8D26\u53F7\u3002" })] })] })] }));
}
