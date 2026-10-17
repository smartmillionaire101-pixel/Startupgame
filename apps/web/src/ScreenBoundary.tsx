import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from './i18n';
import { isStaleChunk, reloadForUpdate } from './stale';
import { openFeedback, reportCrash } from './feedback';

/**
 * A screen (or a tab of one) that fails to draw shows a short note with a
 * "Try again" button instead of blanking the whole game: the bottom bar, the
 * phone and every other screen keep working. Give it a `resetKey` (the tab
 * shown) so moving elsewhere clears the error. A screen whose code is from
 * an older version (a new one was published while the page was open) loads
 * the new version instead.
 */
export class ScreenBoundary extends Component<
  { children: ReactNode; resetKey?: string; name?: string },
  { error: Error | null; key?: string; updating?: boolean }
> {
  override state: { error: Error | null; key?: string; updating?: boolean } = {
    error: null,
    key: this.props.resetKey,
  };

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
    if (isStaleChunk(error) && reloadForUpdate()) return this.setState({ updating: true });
    console.error(`Screen "${this.props.name ?? 'screen'}" failed to draw`, error, info);
    reportCrash(error, this.props.name);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    if (this.state.updating)
      return (
        <div className="card" role="status" data-screen-updating="">
          <p>{t('Loading the new version of Runway…')}</p>
        </div>
      );
    const stale = isStaleChunk(this.state.error);
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
          onClick={() => (stale ? location.reload() : this.setState({ error: null }))}
        >
          {t('Try again')}
        </button>{' '}
        <button type="button" className="btn btn-ghost" onClick={() => openFeedback('bug')}>
          {t('Tell us what happened')}
        </button>
      </div>
    );
  }
}
