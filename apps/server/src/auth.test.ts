import { describe, expect, it } from 'vitest';
import {
  cleanUsername,
  hashPassword,
  isValidEmail,
  newGuestId,
  normalizeEmail,
  randomGuestName,
  signGuestToken,
  signToken,
  verifyPassword,
  verifyToken,
} from './auth';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces a unique salt per hash (same password ⇒ different hash)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips account claims through sign/verify', () => {
    const token = signToken(42, 'Gandalf');
    expect(verifyToken(token)).toEqual({ pid: 42, name: 'Gandalf', guest: false });
  });

  it('round-trips guest claims (gid, no pid)', () => {
    const token = signGuestToken('abc123', 'Guest-7F3A');
    expect(verifyToken(token)).toEqual({ gid: 'abc123', name: 'Guest-7F3A', guest: true });
  });

  it('rejects tampered or malformed tokens', () => {
    const token = signToken(1, 'A');
    expect(verifyToken(token + 'x')).toBeNull();
    expect(verifyToken('garbage')).toBeNull();
    expect(verifyToken(undefined)).toBeNull();
  });

  it('generates distinct guest ids and Guest-prefixed names', () => {
    expect(newGuestId()).not.toBe(newGuestId());
    expect(randomGuestName()).toMatch(/^Guest-[0-9A-F]{4}$/);
  });
});

describe('validation', () => {
  it('normalizes email and validates format', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(isValidEmail('foo@bar.com')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });

  it('cleans usernames within length bounds', () => {
    expect(cleanUsername('  Hero  ')).toBe('Hero');
    expect(cleanUsername('a')).toBeNull();
    expect(cleanUsername('x'.repeat(99))).toBeNull();
  });
});
