'use client';

import { ChartLineUp, Leaf, Megaphone, SignOut } from '@phosphor-icons/react';

const TABS = [
  { href: '/', label: 'Реклама', icon: Megaphone },
  { href: '/organic', label: 'Органіка', icon: Leaf },
];

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '•';
}

export default function Nav({ active, user }: { active: '/' | '/organic'; user: { name: string; email: string } | null }) {
  return (
    <div className="nav-wrap">
      <nav className="nav" aria-label="Розділи">
        <a className="brand" href="/" aria-label="Freight Box Hub, головна">
          <span className="brand-mark"><ChartLineUp size={18} weight="bold" /></span>
          <span className="brand-name title-4">Freight Box Hub</span>
        </a>
        <div className="tabs">
          {TABS.map(({ href, label, icon: Icon }) => (
            <a key={href} href={href} className="tab button-sm" aria-current={active === href ? 'page' : undefined}>
              <Icon size={16} weight={active === href ? 'fill' : 'regular'} />{label}
            </a>
          ))}
        </div>
        {user && (
          <div className="who">
            <span className="avatar caption-3" title={user.email}>{initials(user.name || user.email)}</span>
            <span className="who-name caption-4 ink-2">{user.name || user.email}</span>
            <a className="icon-btn" href="/api/auth/logout" title="Вийти" aria-label="Вийти"><SignOut size={18} /></a>
          </div>
        )}
      </nav>
    </div>
  );
}
