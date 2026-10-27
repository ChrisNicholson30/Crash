import { Component, type ReactNode } from 'react';

/** Last line of defence: if a screen throws, offer a reload instead of a blank page. Saved games survive. */
export class Crashed extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page center-page">
        <h1 className="wordmark small-mark">CRASH</h1>
        <p className="muted">Something went wrong on this screen. Your saved game is safe.</p>
        <button type="button" className="btn gold" onClick={() => location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
