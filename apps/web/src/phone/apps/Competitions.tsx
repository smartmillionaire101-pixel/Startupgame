/**
 * Competitions (Wave 10 §C), a tab of the Events app: the city's pitch
 * competitions (`here.competitions`): sponsor, prize, date, venue, the
 * judges (real players and AI investors) and the line-up. Founders enter
 * with their company, investors join the panel and score each pitch; the
 * stage scene shows it live and, once judged, the results.
 */
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { openCompetition } from '../../city/outings';
import {
  CompetitionActions,
  CompetitionFacts,
  JudgesList,
  ScorePicker,
  Standings,
} from '../../city/competition-ui';
import { competitionsHere, type CompetitionView } from '../../city/wave10';
import { hereOf } from '../../city/travel';
import { H, Nothing, type PhoneCtx } from '../shared';

const statusLabel = (s: string) =>
  ({ open: t('Entries open'), judged: t('Judged'), cancelled: t('Called off') })[s] ?? s;

export function Competitions({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const list = competitionsHere(view);
  const here = hereOf(view);
  const watch = (c: CompetitionView) => {
    ctx.close();
    openCompetition(c.id);
  };
  if (!list.length)
    return (
      <Nothing icon="events">
        {t(
          'No pitch competition in {city} this month. They run every month in San Francisco and every quarter elsewhere.',
          {
            city: here.name,
          },
        )}
      </Nothing>
    );
  return (
    <ul className="phone-list comp-list" aria-label={t('Pitch competitions')}>
      {list.map((c) => (
        <li
          key={c.id}
          className="phone-card comp-card-phone"
          data-competition={c.id}
          data-status={c.status}
        >
          <div className="spread">
            <span className={`pill${c.status === 'open' ? ' pill-good' : ''}`}>
              {statusLabel(c.status)}
            </span>
            <span className="small muted">{tx(c.dateLabel)}</span>
          </div>
          <b className="item-title">{c.name}</b>
          <CompetitionFacts c={c} />
          <H>{t('Judges')}</H>
          <JudgesList c={c} />
          {c.status === 'judged' ? (
            <>
              <H>{t('Results')}</H>
              <Standings c={c} />
            </>
          ) : (
            <>
              <H>{t('Line-up ({n})', { n: c.entries.length })}</H>
              <ul className="comp-lineup" aria-label={t('Line-up')}>
                {c.entries.map((e) => (
                  <li key={e.id} data-entry={e.id} className={e.you ? 'is-you' : undefined}>
                    <div className="spread">
                      <b>{e.companyName}</b>
                      {e.you ? (
                        <span className="pill pill-info">{t('you')}</span>
                      ) : (
                        <span className="small muted">{e.ai ? t('AI startup') : t('player')}</span>
                      )}
                    </div>
                    <span className="small muted">
                      {e.founder.name} · {e.idea}
                    </span>
                    {c.you.judging && !e.you && c.status === 'open' && <ScorePicker c={c} e={e} />}
                  </li>
                ))}
              </ul>
            </>
          )}
          <CompetitionActions c={c} />
          <Button variant="subtle" onClick={() => watch(c)}>
            {c.status === 'judged' ? t('Watch the results on stage') : t('Watch it on stage')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
