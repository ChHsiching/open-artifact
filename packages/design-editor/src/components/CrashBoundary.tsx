/**
 * Keeps a render error in the editor from blanking the page. The subtree
 * below it is replaced by a card that says the canvas could not load and
 * offers a reload; the error still reaches the console (and any
 * `window.onerror` listener) through `reportError`.
 *
 * Nothing in the project is lost: edits are saved as they are made, so a
 * reload reopens the design where it was.
 */

import { Component, type ReactNode } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { Button } from '@open-artifact/ui';

interface CrashBoundaryProps {
  children: ReactNode;
}

export class CrashBoundary extends Component<CrashBoundaryProps, { crashed: boolean }> {
  override state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  /** New children after a crash (a remote change, a page switch) get another try. */
  override componentDidUpdate(previous: CrashBoundaryProps, previousState: { crashed: boolean }): void {
    if (previousState.crashed && this.state.crashed && previous.children !== this.props.children) this.setState({ crashed: false });
  }

  override componentDidCatch(error: unknown): void {
    try {
      if (typeof reportError === 'function') reportError(error);
      else console.error(error);
    } catch {
      // Reporting must never throw out of the boundary.
    }
  }

  override render(): ReactNode {
    return this.state.crashed ? <CrashCard /> : this.props.children;
  }
}

/** The fallback: what happened and how to recover. */
export function CrashCard() {
  return (
    <div data-testid="design-crashed" className="flex h-full w-full items-center justify-center bg-canvas p-8 text-center">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-2">
        <TriangleAlert className="size-6 text-fg-subtle" aria-hidden />
        <h1 className="m-0 text-balance text-[15px] font-semibold text-fg">Couldn’t load this canvas</h1>
        <p className="m-0 text-pretty text-[13px] text-fg-muted">Reload to try again.</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => window.location.reload()}>
          <RotateCw className="size-3.5" aria-hidden />
          Reload
        </Button>
      </div>
    </div>
  );
}
