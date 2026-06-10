import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX_LENGTH } from '@arena/shared';
import { useChatStore } from '../store/useChatStore';
import { sendChat } from '../network/colyseus';

/**
 * Global chat (Phase 10.2): a message log + input, shown in both town and arena.
 * Enter focuses the input when you're not already typing; submitting sends and
 * blurs (so game keys work again). The server sanitizes and broadcasts.
 */
export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Keep the log pinned to the latest message.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  // Enter focuses chat unless we're already in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed) sendChat(trimmed);
    setText('');
    inputRef.current?.blur();
  };

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex w-80 max-w-[60vw] flex-col gap-1">
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
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Press Enter to chat…"
          aria-label="Chat message"
          className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-[13px] outline-none transition focus:border-accent"
        />
      </form>
    </div>
  );
}
