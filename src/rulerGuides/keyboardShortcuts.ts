export interface ShortcutHandlers {
  onResetOrigin: () => void;
  onToggleRulers: () => void;
}

export function attachShortcuts(handlers: ShortcutHandlers): () => void {
  const onKeydown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    // Cmd/Ctrl + R — toggle rulers
    if (mod && !e.altKey && e.code === 'KeyR') {
      e.preventDefault();
      handlers.onToggleRulers();
      return;
    }
    // Cmd/Ctrl + Alt + R — reset origin
    if (mod && e.altKey && e.code === 'KeyR') {
      e.preventDefault();
      handlers.onResetOrigin();
    }
  };
  window.addEventListener('keydown', onKeydown);
  return () => window.removeEventListener('keydown', onKeydown);
}
