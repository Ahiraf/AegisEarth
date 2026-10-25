import { useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

type RevealProps = {
  id?: string;
  className?: string;
  children: ReactNode;
};

// A page section that fades in once when it first scrolls into view.
// With "reduce motion" on (or no IntersectionObserver) it is simply visible.
export function Reveal({ id, className, children }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown) return;
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <section ref={ref} id={id} className={`blk rv${shown ? ' in' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </section>
  );
}
