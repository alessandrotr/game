import { useState, type FormEvent } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../store/useAuthStore';
import { Button, Input } from './primitives';
import { ScreenHeader } from './ScreenHeader';

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
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-arena-radial p-5">
      <div className="w-full max-w-sm">
        <ScreenHeader
          className="mb-8"
          subtitle={isRegister ? 'Create your account' : 'Sign in to your account'}
        />

        {/* Mode toggle */}
        <ToggleGroup.Root
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as 'login' | 'register')}
          aria-label="Authentication mode"
          className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1"
        >
          {(['login', 'register'] as const).map((m) => (
            <ToggleGroup.Item
              key={m}
              value={m}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold tracking-wide text-muted transition hover:text-white',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
                'data-[state=on]:bg-gold/15 data-[state=on]:text-gold',
              )}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>

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
