import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type ComboOption = { value: string; label: string };

interface ComboSearchProps {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  maxItems?: number;
  disabled?: boolean;
}

export const ComboSearch: React.FC<ComboSearchProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Choisir…',
  maxItems = 5,
  disabled
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = options.find(o => o.value === value);
  const list = options.filter(o => {
    const q = query.trim().toLowerCase();
    return !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q);
  }).slice(0, maxItems);

  const [menuPos, setMenuPos] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    openUp: boolean;
  }>({ left: 0, top: 0, width: 0, maxHeight: 240, openUp: false });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const desiredMax = 280;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(desiredMax, (openUp ? spaceAbove - 10 : spaceBelow - 10)));
    
    setMenuPos({
      left: Math.round(rect.left),
      top: Math.round(openUp ? rect.top - Math.min(desiredMax, maxHeight) : rect.bottom),
      width: Math.round(rect.width),
      maxHeight,
      openUp
    });
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      const target = e.target as Node;
      if (wrapRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: '#1f2937',
          color: '#e5e7eb',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '0.45rem 0.6rem',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        {selected ? selected.label : <span style={{ color: '#9ca3af' }}>{placeholder}</span>}
      </button>
      
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: 'fixed',
            zIndex: 100000,
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            background: '#111827',
            color: '#e5e7eb',
            border: '1px solid #374151',
            borderRadius: 8,
            boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
            padding: 8
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 0.6rem',
              borderRadius: 6,
              border: '1px solid #374151',
              background: '#1f2937',
              color: '#e5e7eb',
              marginBottom: 8
            }}
          />
          <div style={{ maxHeight: menuPos.maxHeight, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {list.length === 0 ? (
              <div style={{ color: '#9ca3af', padding: '0.25rem 0.2rem' }}>Aucun résultat</div>
            ) : (
              list.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  type="button"
                  style={{
                    textAlign: 'left',
                    width: '100%',
                    background: '#1f2937',
                    border: '1px solid #374151',
                    color: '#e5e7eb',
                    borderRadius: 6,
                    padding: '0.4rem 0.6rem',
                    cursor: 'pointer'
                  }}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
