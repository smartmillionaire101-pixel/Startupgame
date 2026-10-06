/**
 * News: the city's headlines, the feed and your stories with reporters
 * (Wave 7: the News tab's content now lives in the phone).
 */
import { NewsScreen } from '../../screens/News';
import type { PhoneCtx } from '../shared';

export function News(_: { ctx: PhoneCtx }) {
  return (
    <div className="phone-news">
      <NewsScreen />
    </div>
  );
}
