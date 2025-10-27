import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export function CopyButton({ value, label = '复制' }) {
    const [status, setStatus] = useState('idle');
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setStatus('copied');
            setTimeout(() => setStatus('idle'), 1500);
        }
        catch (error) {
            console.error('Copy failed', error);
            setStatus('error');
        }
    };
    return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' }, children: [_jsx("button", { type: "button", onClick: handleCopy, children: label }), status === 'copied' && _jsx("span", { className: "status", children: "\u5DF2\u590D\u5236" }), status === 'error' && _jsx("span", { className: "status error", children: "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236" })] }));
}
