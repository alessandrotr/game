import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ScreenHeaderProps {
  /** Tagline under the ARENA wordmark. */
  subtitle: ReactNode;
  className?: string;
  /** Override the wordmark size (defaults to `text-5xl`). */
  titleClassName?: string;
  /** Extra header content, e.g. the signed-in user / sign-out control. */
  children?: ReactNode;
}

/** The ARENA wordmark + tagline shown atop the auth and character-select screens. */
export function ScreenHeader({ subtitle, className, titleClassName, children }: ScreenHeaderProps) {
  return (
    <header className={cn('text-center', className)}>
      <h1
        className={cn(
          'font-display tracking-[0.35em] text-gold drop-shadow-[0_2px_12px_rgba(200,162,74,0.35)]',
          titleClassName ?? 'text-5xl',
        )}
      >
        ARENA
      </h1>
      <p className="mt-2 text-[11px] uppercase tracking-[0.4em] text-muted">{subtitle}</p>
      {children}
    </header>
  );
}
