import { useEffect } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ActiveModal {
  el: HTMLElement;
  returnFocusTo: HTMLElement | null;
  inerted: HTMLElement[];
}

/** Makes every element outside `el` inert (not focusable, hidden from screen readers).
 *  Elements marked `data-modal-keep` (the toast region) stay live so messages are still announced. */
function inertOutside(el: HTMLElement): HTMLElement[] {
  const changed: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children) as HTMLElement[]) {
      if (sibling !== node && !sibling.inert && sibling.tagName !== 'SCRIPT' && !sibling.hasAttribute('data-modal-keep')) {
        sibling.inert = true;
        changed.push(sibling);
      }
    }
    node = parent;
  }
  return changed;
}

function findCloseButton(el: HTMLElement): HTMLElement | null {
  const explicit = el.querySelector<HTMLElement>('[data-dialog-close]');
  if (explicit) return explicit;
  const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
  return (
    buttons.find((b) => /^fechar/i.test(b.getAttribute('aria-label') || '')) ||
    buttons.find((b) => /^\s*cancelar\s*$/i.test(b.textContent || '')) ||
    null
  );
}

/**
 * Gives every `[aria-modal="true"]` element in the app proper modal behaviour (WCAG 2.4.3 / 2.1.2):
 * focus moves into the dialog, Tab stays inside it, the page behind becomes inert,
 * Escape closes it and focus returns to the control that opened it.
 */
export function useModalFocusManager() {
  useEffect(() => {
    const stack: ActiveModal[] = [];

    const open = (el: HTMLElement) => {
      if (stack.some((m) => m.el === el)) return;
      const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const inerted = inertOutside(el);
      stack.push({ el, returnFocusTo, inerted });
      // Respect autoFocus inside the dialog; otherwise focus the first control
      requestAnimationFrame(() => {
        if (!el.contains(document.activeElement)) {
          const first = el.querySelector<HTMLElement>('[autofocus], input:not([type="hidden"]), select, textarea') ||
            el.querySelector<HTMLElement>(FOCUSABLE);
          (first || el).focus();
        }
      });
    };

    const close = (modal: ActiveModal) => {
      modal.inerted.forEach((n) => (n.inert = false));
      stack.splice(stack.indexOf(modal), 1);
      // Only restore when focus was lost with the dialog (don't steal focus the app moved on purpose)
      const current = document.activeElement;
      const focusLost = !current || current === document.body || modal.el.contains(current) || !document.contains(current);
      if (focusLost && modal.returnFocusTo && document.contains(modal.returnFocusTo)) {
        modal.returnFocusTo.focus();
      }
    };

    const sync = () => {
      const present = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
      for (const modal of [...stack].reverse()) {
        if (!present.includes(modal.el)) close(modal);
      }
      present.forEach(open);
    };

    // Batch DOM mutations: at most one check per animation frame
    let scheduled = 0;
    const observer = new MutationObserver(() => {
      if (!scheduled) scheduled = requestAnimationFrame(() => { scheduled = 0; sync(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    sync();

    const onKeyDown = (e: KeyboardEvent) => {
      const top = stack[stack.length - 1];
      if (!top) return;
      if (e.key === 'Escape') {
        const closeBtn = findCloseButton(top.el);
        if (closeBtn) {
          e.preventDefault();
          closeBtn.click();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = Array.from(top.el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || !top.el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !top.el.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(scheduled);
      document.removeEventListener('keydown', onKeyDown);
      [...stack].reverse().forEach(close);
    };
  }, []);
}
