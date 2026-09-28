/** ModelSelect：LobeChat 风格模型下拉（厂商图标 + 搜索过滤 + 当前项高亮），可手输自定义模型 */
import { useEffect, useRef, useState } from 'react';
import { ProviderBrand } from './ProviderBrand';

interface ModelSelectProps {
  /** 可选模型列表（白名单过滤后） */
  models: string[];
  value: string;
  onChange: (v: string) => void;
  brandName: string;
  brandType: string;
  placeholder?: string;
}

export function ModelSelect({ models, value, onChange, brandName, brandType, placeholder }: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const kw = filter.trim().toLowerCase();
  const filtered = models.filter((m) => m.toLowerCase().includes(kw));
  const showPanel = open && models.length > 0;

  return (
    <div className="model-select" ref={boxRef}>
      <input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setFilter(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showPanel && (
        <div className="model-select-panel">
          <div className="model-select-list">
            {filtered.map((m) => (
              <button
                key={m}
                type="button"
                className={`model-select-item${m === value ? ' current' : ''}`}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                  setFilter('');
                }}
                title={m}
              >
                <ProviderBrand name={brandName} type={brandType} size={13} />
                <span className="model-select-name">{m}</span>
                {m === value && <span className="model-select-check">✓</span>}
              </button>
            ))}
            {filtered.length === 0 && <div className="model-select-empty">无匹配模型</div>}
          </div>
        </div>
      )}
    </div>
  );
}
