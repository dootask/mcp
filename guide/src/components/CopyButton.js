import { jsx as _jsx } from "react/jsx-runtime";
import { messageSuccess, messageError } from '@dootask/tools';
export function CopyButton({ value, label = '复制' }) {
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            messageSuccess('已复制');
        }
        catch (error) {
            console.error('Copy failed', error);
            messageError('复制失败，请手动复制');
        }
    };
    return (_jsx("span", { className: "copy-button", children: _jsx("button", { type: "button", onClick: handleCopy, children: label }) }));
}
