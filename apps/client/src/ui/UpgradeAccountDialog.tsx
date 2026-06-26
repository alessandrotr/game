import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useUpgradeStore } from '../store/useUpgradeStore';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Input,
} from './primitives';

/**
 * The "claim your account" form for guests: attaches email/username/password to
 * the current guest session, keeping all progress earned so far. On success the
 * auth store flips `guest` → false and `onDone` fires (close the host surface);
 * on failure it stays put with the error. Shared by the character-select dialog
 * and the town sidebar's "Save progress" section.
 */
export function UpgradeAccountForm({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const upgradeAccount = useAuthStore((s) => s.upgradeAccount);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    upgradeAccount(email.trim(), username.trim(), password)
      .then(() => onDone?.())
      .catch(() => {
        /* error shown in the store; keep the form open */
      });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Create an account to keep your characters and stats. Your guest progress carries over.
      </p>
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
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Display name"
          maxLength={24}
          autoComplete="username"
          required
          aria-label="Display name"
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 8 characters)"
          autoComplete="new-password"
          required
          aria-label="Password"
        />
        <Button
          type="submit"
          variant="gold"
          size="lg"
          disabled={busy}
          className="mt-1 tracking-[0.15em]"
        >
          {busy ? 'PLEASE WAIT…' : 'CREATE ACCOUNT'}
        </Button>
        {error && (
          <div role="alert" className="text-center text-[13px] text-negative">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}

/**
 * Character-select "claim your account" modal for guests. Visibility is driven by
 * {@link useUpgradeStore}; opened from the character-select screen (AccountChip).
 * In town the same form lives inline in the sidebar's "Save progress" section.
 */
export function UpgradeAccountDialog() {
  const open = useUpgradeStore((s) => s.open);
  const setOpen = useUpgradeStore((s) => s.setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <DialogTitle className="font-display text-2xl tracking-wide text-gold">
            Save your progress
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" aria-label="Close" className="-mr-2 -mt-1 text-muted">
              <X size={18} aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
        <UpgradeAccountForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
