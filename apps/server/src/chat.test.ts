import { describe, expect, it } from 'vitest';
import { CHAT_MAX_LENGTH, sanitizeChat } from '@arena/shared';
import { allowChat, CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS } from './chat';

describe('allowChat (rate limit)', () => {
  it('allows up to CHAT_RATE_MAX messages in a window, then blocks', () => {
    const recent: number[] = [];
    for (let i = 0; i < CHAT_RATE_MAX; i++) {
      expect(allowChat(recent, 1000 + i)).toBe(true);
    }
    // The next one within the window is blocked.
    expect(allowChat(recent, 1000 + CHAT_RATE_MAX)).toBe(false);
  });

  it('lets messages through again once older ones age out of the window', () => {
    const recent: number[] = [];
    for (let i = 0; i < CHAT_RATE_MAX; i++) allowChat(recent, 1000);
    expect(allowChat(recent, 1000)).toBe(false);
    // Past the window, the early stamps expire and a slot frees up.
    expect(allowChat(recent, 1000 + CHAT_RATE_WINDOW_MS)).toBe(true);
  });
});

describe('sanitizeChat', () => {
  it('trims and keeps normal text', () => {
    expect(sanitizeChat('  hello world  ')).toBe('hello world');
  });

  it('collapses internal whitespace', () => {
    expect(sanitizeChat('a\t\t b\n\nc')).toBe('a b c');
  });

  it('strips control characters (replaced with spaces, then collapsed)', () => {
    const withControls = `hi${String.fromCharCode(0, 7, 13)}there${String.fromCharCode(127)}`;
    expect(sanitizeChat(withControls)).toBe('hi there');
  });

  it('returns null for empty / whitespace-only / non-strings', () => {
    expect(sanitizeChat('   ')).toBeNull();
    expect(sanitizeChat('')).toBeNull();
    expect(sanitizeChat(42)).toBeNull();
    expect(sanitizeChat(undefined)).toBeNull();
  });

  it('caps length at CHAT_MAX_LENGTH', () => {
    const long = 'x'.repeat(CHAT_MAX_LENGTH + 50);
    expect(sanitizeChat(long)).toHaveLength(CHAT_MAX_LENGTH);
  });
});
