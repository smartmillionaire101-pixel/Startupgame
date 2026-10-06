/**
 * Social: a feed of what's happening in the city (businesses opening,
 * events, raises and milestones from the news, your own milestones), plus
 * a cosmetic "post" of your own, kept on this device.
 */
import { useState } from 'react';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { businessesOf } from '../../city/contract';
import { eventsOf, newBusinessIds } from '../../city/people';
import { cityViewOf } from '../../city/travel';
import type { IconName } from '../icons';
import { Nothing, RowIcon, type PhoneCtx } from '../shared';

interface Post {
  key: string;
  icon: IconName;
  color: string;
  who: string;
  text: string;
  month: number;
  place?: string;
}

const POSTS_KEY = 'runway.posts';

function readPosts(): Post[] {
  try {
    const raw = localStorage.getItem(POSTS_KEY);
    const xs = raw ? (JSON.parse(raw) as Post[]) : [];
    return Array.isArray(xs) ? xs.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function Social({ ctx }: { ctx: PhoneCtx }) {
  const { view, toast } = useView();
  const city = cityViewOf(view);
  const [mine, setMine] = useState<Post[]>(readPosts);
  const [text, setText] = useState('');
  const month = view.market.month;

  const feed: Post[] = [...mine];
  const fresh = new Set(newBusinessIds(city));
  for (const b of businessesOf(city))
    if (fresh.has(b.id))
      feed.push({
        key: `biz:${b.id}`,
        icon: 'shop',
        color: '#db2777',
        who: b.name,
        text: t('Just opened: {kind} on {street}.', {
          kind: tx(b.kindLabel),
          street: b.street ?? b.district,
        }),
        month,
        place: `biz:${b.id}`,
      });
  for (const e of eventsOf(city) ?? [])
    if (e.status === 'upcoming')
      feed.push({
        key: `ev:${e.id}`,
        icon: 'social',
        color: '#c026d3',
        who: e.host.name,
        text: t('Hosting “{title}”, {going} going.', { title: e.title, going: e.going }),
        month: e.month,
        place: 'eventhall',
      });
  for (const n of view.news.slice(0, 20))
    feed.push({
      key: `n:${n.id}`,
      icon: n.kind === 'raise' ? 'invest' : n.kind === 'milestone' ? 'founder' : 'news',
      color: n.kind === 'raise' ? '#059669' : n.kind === 'milestone' ? '#d97706' : '#334155',
      who: n.outletName,
      text: tx(n.headline),
      month: n.month,
    });
  for (const i of view.inbox)
    if (i.kind === 'milestone')
      feed.push({
        key: `m:${i.id}`,
        icon: 'founder',
        color: '#d97706',
        who: view.me.name,
        text: tx(i.text),
        month: i.month,
      });
  feed.sort((a, b) => b.month - a.month);

  const post = () => {
    const body = text.trim();
    if (!body) return;
    const p: Post = {
      key: `me:${Date.now()}`,
      icon: 'founder',
      color: '#0f766e',
      who: view.me.name,
      text: body,
      month,
    };
    const next = [p, ...mine].slice(0, 20);
    setMine(next);
    setText('');
    try {
      localStorage.setItem(POSTS_KEY, JSON.stringify(next));
    } catch {
      /* not saved: lasts for this session */
    }
    toast(t('Posted.'), 'ok');
  };

  return (
    <div className="phone-stack">
      <form
        className="phone-compose phone-post"
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <input
          aria-label={t('Share a milestone')}
          placeholder={t('Share a milestone')}
          value={text}
          maxLength={140}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={!text.trim()}>
          {t('Post')}
        </Button>
      </form>
      {feed.length === 0 ? (
        <Nothing icon="social">{t('Quiet in town. Things happen as months go by.')}</Nothing>
      ) : (
        <ul className="phone-list" aria-label={t('Feed')}>
          {feed.slice(0, 50).map((p) => (
            <li key={p.key} className="phone-post-item">
              <RowIcon name={p.icon} color={p.color} />
              <div className="phone-row-main">
                <span className="item-title">{p.who}</span>
                <span>{p.text}</span>
                <span className="small muted">
                  {t('Month {n}', { n: p.month })}
                  {p.place && (
                    <>
                      {' · '}
                      <button className="phone-link" onClick={() => ctx.goPlace(p.place!)}>
                        {t('Go there')}
                      </button>
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
