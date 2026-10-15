import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from './i18n';

/**
 * A screen (or a tab of one) that fails to draw shows a short note with a
 * "Try again" button instead of blanking the whole game: the bottom bar, the
 * phone and every other screen keep working. Give it a `resetKey` (the tab
 * shown) so moving elsewhere clears the error.
 */
export class ScreenBoundary extends Component<
  { children: ReactNode; resetKey?: string; name?: string },
  { error: Error | null; key?: string }
> {
  override state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetKey?: string },
    state: { error: Error | null; key?: string },
  ) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Screen "${this.props.name ?? 'screen'}" failed to draw`, error, info);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" role="alert" data-screen-error={this.props.name ?? ''}>
        <p>
          <b>{t('This screen couldn’t open.')}</b>
        </p>
        <p className="small muted">
          {t('Your game is safe. Try again, or open another tab and come back.')}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => this.setState({ error: null })}
        >
          {t('Try again')}
        </button>
      </div>
    );
  }
}
