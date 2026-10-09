/** Keyboard containment shared by modal dialogs; never intercept ordinary fields. */
export function modalFocusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex]'
  )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0
    && element.getAttribute("type") !== "hidden" && !element.closest('[inert], [aria-hidden="true"]'));
}

function isTopmostModal(panel: HTMLElement): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .filter(dialog => dialog.getClientRects().length > 0);
  // Portalled/nested dialogs are appended after their parent. The command
  // palette also carries the largest overlay z-index in the application.
  const depth = (dialog: HTMLElement) => {
    let element: HTMLElement | null = dialog;
    let z = 0;
    while (element && element !== document.body) {
      z = Math.max(z, Number.parseInt(getComputedStyle(element).zIndex, 10) || 0);
      element = element.parentElement;
    }
    return z;
  };
  const top = dialogs.reduce<HTMLElement | null>((current, dialog) => !current || depth(dialog) >= depth(current) ? dialog : current, null);
  return top === panel;
}

export function containModalFocus(panel: HTMLElement, onEscape: () => void, initialFocus?: HTMLElement | null): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focusFirst = () => (modalFocusables(panel)[0] || panel).focus({ preventScroll: true });
  const frame = requestAnimationFrame(() => {
    if (isTopmostModal(panel)) (initialFocus || modalFocusables(panel)[0] || panel).focus({ preventScroll: true });
  });
  const key = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !isTopmostModal(panel)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    }
    if (event.key !== "Tab") return;
    const list = modalFocusables(panel);
    const first = list[0], last = list[list.length - 1];
    if (!first) { event.preventDefault(); panel.focus({ preventScroll: true }); return; }
    if (!panel.contains(document.activeElement)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };
  const focus = (event: FocusEvent) => {
    if (isTopmostModal(panel) && !panel.contains(event.target as Node)) focusFirst();
  };
  document.addEventListener("keydown", key);
  document.addEventListener("focusin", focus);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("keydown", key);
    document.removeEventListener("focusin", focus);
    // Layout cleanup runs inside React's commit. React then restores the old
    // active element, which can be the exiting panel. Restore our trigger
    // after that commit so removing the animated panel cannot drop focus.
    queueMicrotask(() => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    });
  };
}
