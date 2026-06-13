import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { reportClientError } from '../network/telemetry';

interface Props {
  children: ReactNode;
  /** Called once when a descendant throws during render/commit — use it to tear
   *  down the broken session so the app can fall back to a safe screen. */
  onError: () => void;
}

interface State {
  errored: boolean;
}

/**
 * Catches render-time crashes in the game tree and degrades gracefully instead
 * of white-screening the whole app. On an error it tears down the session (via
 * `onError`), which flips the app back to the JoinScreen — so a bad frame ends
 * as a clean disconnect, exactly like a dropped connection.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { errored: false };

  static getDerivedStateFromError(): State {
    return { errored: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] render crash — returning to the join screen:', error, info.componentStack);
    // The boundary swallows the error (we render null), so Sentry's global
    // handler never sees it — report it explicitly with the component stack.
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
    reportClientError('render-crash', {
      message: error.message,
      detail: error.stack ?? info.componentStack ?? undefined,
    });
    this.props.onError();
  }

  override componentDidUpdate(): void {
    // Once the session is torn down the parent stops rendering this subtree;
    // reset so a fresh session mounts cleanly if we're ever re-rendered.
    if (this.state.errored) this.setState({ errored: false });
  }

  override render(): ReactNode {
    return this.state.errored ? null : this.props.children;
  }
}
