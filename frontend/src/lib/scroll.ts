// The app uses hash routing (#/learn), so normal "#section" links would change the page.
// Use this to scroll to a section instead. It respects "reduce motion".
export function scrollToId(id: string, moveFocus = false): void {
  const element = document.getElementById(id);
  if (!element) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  if (moveFocus) {
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: true });
  }
}
