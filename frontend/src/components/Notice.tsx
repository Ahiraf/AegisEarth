import type { ReactNode } from 'react';

type NoticeTone = 'info' | 'warning' | 'error';

type NoticeProps = {
  tone: NoticeTone;
  title?: string;
  children: ReactNode;
};

const DEFAULT_TITLES: Record<NoticeTone, string> = {
  info: 'Note',
  warning: 'Warning',
  error: 'Error',
};

const ICONS: Record<NoticeTone, string> = { info: 'i', warning: '!', error: 'x' };

export function Notice({ tone, title, children }: NoticeProps) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="notice-icon" aria-hidden="true">{ICONS[tone]}</span>
      <div className="notice-body">
        <p className="notice-title">{title ?? DEFAULT_TITLES[tone]}</p>
        {children}
      </div>
    </div>
  );
}