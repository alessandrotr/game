import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX_LENGTH } from '@arena/shared';
import { useChatStore } from '../store/useChatStore';
import { sendChat } from '../network/colyseus';
import { Badge, Button, Input } from './primitives';

const COLLAPSE_KEY = 'arena.chat.collapsed';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch {
    /* storage blocked — preference only lasts this session */
  }
}

/**
 * Global chat (Phase 10.2): a message log + input, shown in both town and arena.
 * Per-room history (the server replays the last 50 on join); town chat is
 * persisted server-side. Can be hidden to a small pill and reopened; the choice
 * is remembered across reloads. Enter focuses the input (reopening if hidden);
 * submitting sends and blurs so game keys work again.
 */
export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  /** Focus the input on the next render after an Enter-triggered reopen. */
  const focusOnOpen = useRef(false);

  const toggle = (next: boolean) => {
    setCollapsed(next);
    saveCollapsed(next);
  };

  // Keep the log pinned to the latest message.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, collapsed]);

  // Focus the input once it mounts after reopening via Enter.
  useEffect(() => {
    if (!collapsed && focusOnOpen.current) {
      focusOnOpen.current = false;
      inputRef.current?.focus();
    }
  }, [collapsed]);

  // Enter focuses chat (reopening it if hidden) unless already in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (collapsed) {
        focusOnOpen.current = true;
        toggle(false);
      } else {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed) sendChat(trimmed);
    setText('');
    inputRef.current?.blur();
  };

  if (collapsed) {
    return (
      <Button
        variant="panel"
        onClick={() => toggle(false)}
        className="pointer-events-auto absolute bottom-4 left-4 gap-1.5 rounded-lg bg-panel/80 px-3 py-2 text-[13px] backdrop-blur-sm"
      >
        💬 Chat
        {messages.length > 0 && <Badge variant="accent">{messages.length}</Badge>}
      </Button>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex w-80 max-w-[60vw] flex-col gap-1">
      <div className="pointer-events-auto flex items-center justify-between px-1">
        <span className="text-[11px] uppercase tracking-wider text-muted">Chat</span>
        <Button variant="ghost" size="icon" onClick={() => toggle(true)} aria-label="Hide chat" title="Hide chat">
          ▾
        </Button>
      </div>

      {messages.length > 0 && (
        <div
          ref={logRef}
          className="pointer-events-auto max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-panel/70 px-3 py-2 text-[13px] leading-snug"
        >
          {messages.map((m, i) => (
            <div key={i} className="break-words">
              <span className="font-semibold text-accent">{m.from}:</span>{' '}
              <span className="text-[#e6e9f5]">{m.text}</span>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={onSubmit} className="pointer-events-auto">
        <Input
          ref={inputRef}
          tone="accent"
          inputSize="sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Press Enter to chat…"
          aria-label="Chat message"
          className="w-full"
        />
      </form>
    </div>
  );
}
