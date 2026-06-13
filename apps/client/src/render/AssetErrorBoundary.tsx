import { Component, type ReactNode } from 'react';
import { reportClientError } from '../network/telemetry';

interface Props {
  /** Identifies the failed asset in the report (e.g. its GLTF url). */
  label: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Localized error boundary for a single asset (a GLTF model). A failed/corrupt
 * load throws out of `useGLTF`; without this it would bubble to the app-level
 * ErrorBoundary and drop the whole game to the JoinScreen. Here we instead
 * capture the failure and render nothing, so one bad model just goes missing
 * while the rest of the scene keeps running.
 */
export class AssetErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    console.error(`[asset] failed to load "${this.props.label}":`, error);
    reportClientError('asset-load', {
      message: `asset failed to load: ${this.props.label}`,
      detail: error.stack ?? error.message,
    });
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
