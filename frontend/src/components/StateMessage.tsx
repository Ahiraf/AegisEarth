import type { ReactNode } from 'react';

type StateMessageProps = {
  kind: 'loading' | 'empty' | 'error';
  title: string;
  children?: ReactNode;
};

export function StateMessage({ kind, title, children }: StateMessageProps) {
  return (
    <div className={`state state-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <p className="state-title">{title}</p>
      {children ? <div className="state-body">{children}</div> : null}
    </div>
  );
}