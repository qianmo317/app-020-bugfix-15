import { useEffect, useState, type ReactNode } from 'react';

/** 轻量 hash 路由（不引第三方依赖）：#/building/:id、#/floor/:id、#/floor/:id/print ... */
export function currentPath(): string {
  const h = window.location.hash;
  if (!h.startsWith('#')) return '/';
  return h.slice(1).split('?')[0] || '/';
}

/** hash 中的查询串（如 #/floor/f1?fac=id → fac=id） */
export function currentQuery(): URLSearchParams {
  const h = window.location.hash;
  const qi = h.indexOf('?');
  return new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : '');
}

export function navigate(to: string) {
  if (window.location.hash === `#${to}`) return;
  window.location.hash = `#${to}`;
}

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const path = hash.startsWith('#') ? hash.slice(1).split('?')[0] || '/' : '/';
  const qi = hash.indexOf('?');
  return {
    path,
    parts: path.split('/').filter(Boolean),
    query: new URLSearchParams(qi >= 0 ? hash.slice(qi + 1) : ''),
  };
}

export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
