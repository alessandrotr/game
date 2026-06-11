import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { Button, Input } from './primitives';

/**
 * Account gate: sign in or register with email + password. Shown before the
 * character-select screen; on success the auth store flips to `authed` and the
 * app reveals the game.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);

  const isRegister = mode === 'register';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (isRegister) void signUp(email.trim(), username.trim(), password);
    else void signIn(email.trim(), password);
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_50%_22%,#191b2c,#07080d_72%)] p-5">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="font-display text-5xl tracking-[0.35em] text-gold drop-shadow-[0_2px_12px_rgba(200,162,74,0.35)]">
            ARENA
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.4em] text-muted">
            {isRegister ? 'Create your account' : 'Sign in to your account'}
          </p>
        </header>

        {/* Mode toggle */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold tracking-wide transition ${
                mode === m ? 'bg-gold/15 text-gold' : 'text-muted hover:text-white'
              }`}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
            aria-label="Email"
          />
          {isRegister && (
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Display name"
              maxLength={24}
              autoComplete="username"
              required
              aria-label="Display name"
            />
          )}
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? 'Password (min 8 characters)' : 'Password'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            aria-label="Password"
          />
          <Button type="submit" variant="gold" size="lg" disabled={busy} className="mt-1 tracking-[0.15em]">
            {busy ? 'PLEASE WAIT…' : isRegister ? 'CREATE ACCOUNT' : 'SIGN IN'}
          </Button>
          {error && (
            <div role="alert" className="text-center text-[13px] text-negative">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
