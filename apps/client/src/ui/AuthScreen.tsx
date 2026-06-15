import { useState, type FormEvent } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Sparkles, Trophy, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../store/useAuthStore';
import { Button, Input } from './primitives';
import { OnlinePlayersCounter } from './OnlinePlayersCounter';
import { ScreenHeader } from './ScreenHeader';

type Mode = 'guest' | 'login' | 'register';

const TABS: { value: Mode; label: string }[] = [
  { value: 'guest', label: 'Guest' },
  { value: 'login', label: 'Sign In' },
  { value: 'register', label: 'Register' },
];

/**
 * The app's entry screen (shown whenever not signed in). A live town backdrop
 * sits behind a tabbed card: Guest (default), Sign In, Register. The Guest tab
 * explains how guest play works and drops the player straight in; their progress
 * is saved from the first match and can be claimed later by registering.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('guest');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const signInAsGuest = useAuthStore((s) => s.signInAsGuest);

  const isRegister = mode === 'register';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (isRegister) void signUp(email.trim(), username.trim(), password);
    else void signIn(email.trim(), password);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto">
      {/* The town backdrop is mounted by App (shared with the character-select
          screen so sign-in doesn't reload it). Here we only add the scrim that
          darkens + vignettes the live scene so the card stays legible. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />

      <div className="relative flex min-h-full items-center justify-center p-5">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-panel/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md">
          <ScreenHeader
            className="mb-4"
            subtitle={
              mode === 'guest'
                ? 'Jump straight into the world'
                : isRegister
                  ? 'Create your account'
                  : 'Sign in to your account'
            }
          />

          {/* Mode tabs — Guest first and selected by default. */}
          <ToggleGroup.Root
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
            aria-label="Authentication mode"
            className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/30 p-1"
          >
            {TABS.map((tab) => (
              <ToggleGroup.Item
                key={tab.value}
                value={tab.value}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold tracking-wide text-muted transition hover:text-white',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
                  'data-[state=on]:bg-gold/15 data-[state=on]:text-gold',
                )}
              >
                {tab.label}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>

          {mode === 'guest' ? (
            <div className="flex flex-col gap-4">
              <ul className="flex flex-col gap-3 text-sm text-muted">
                <li className="flex items-start gap-2.5">
                  <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-gold" />
                  Play instantly — no email or password needed.
                </li>
                <li className="flex items-start gap-2.5">
                  <Trophy size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-gold" />
                  Your levels and stats are saved from your first match.
                </li>
                <li className="flex items-start gap-2.5">
                  <UserPlus size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-gold" />
                  Create an account later to keep your progress for good.
                </li>
              </ul>
              <Button
                type="button"
                variant="gold"
                size="lg"
                disabled={busy}
                onClick={() => void signInAsGuest()}
                className="tracking-[0.15em]"
              >
                {busy ? 'PLEASE WAIT…' : 'CONTINUE AS GUEST'}
              </Button>
              {error && (
                <div role="alert" className="text-center text-[13px] text-negative">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-email" className="text-sm font-medium text-muted">
                  Email
                </label>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  required
                />
              </div>
              {isRegister && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="auth-username" className="text-sm font-medium text-muted">
                    Display name
                  </label>
                  <Input
                    id="auth-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Display name"
                    maxLength={24}
                    autoComplete="username"
                    required
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-password" className="text-sm font-medium text-muted">
                  Password
                </label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? 'Password (min 8 characters)' : 'Password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  required
                />
              </div>
              <Button
                type="submit"
                variant="gold"
                size="lg"
                disabled={busy}
                className="mt-1 tracking-[0.15em]"
              >
                {busy ? 'PLEASE WAIT…' : isRegister ? 'CREATE ACCOUNT' : 'SIGN IN'}
              </Button>
              {error && (
                <div role="alert" className="text-center text-[13px] text-negative">
                  {error}
                </div>
              )}
            </form>
          )}
          {/* Live player count — shown for every tab. */}
          <div className="mt-6">
            <OnlinePlayersCounter />
          </div>
        </div>
      </div>
    </div>
  );
}
