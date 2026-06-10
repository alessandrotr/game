import { describe, expect, it } from 'vitest';
import { CHAT_MAX_LENGTH, sanitizeChat } from '@arena/shared';

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
