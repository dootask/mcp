import { messageSuccess, messageError } from '@dootask/tools';

interface CopyButtonProps {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = '复制' }: CopyButtonProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      messageSuccess('已复制');
    } catch (error) {
      console.error('Copy failed', error);
      messageError('复制失败，请手动复制');
    }
  };

  return (
    <span className="copy-button">
      <button type="button" onClick={handleCopy}>
        {label}
      </button>
    </span>
  );
}
