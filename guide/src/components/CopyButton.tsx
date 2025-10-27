import { useState } from 'react';

interface CopyButtonProps {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = '复制' }: CopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (error) {
      console.error('Copy failed', error);
      setStatus('error');
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button type="button" onClick={handleCopy}>
        {label}
      </button>
      {status === 'copied' && <span className="status">已复制</span>}
      {status === 'error' && <span className="status error">复制失败，请手动复制</span>}
    </span>
  );
}
