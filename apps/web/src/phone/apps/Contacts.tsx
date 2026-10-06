/**
 * Contacts (Wave 6): the people you saved and met, with warmth and kind.
 * Chat opens their thread; Invite over asks them home (`home.invite`, Wave 7);
 * Remove forgets them (`contact.remove`).
 */
import { useState } from 'react';
import { t } from '../../i18n';
import { useView } from '../../store';
import { Bar, Button } from '../../ui';
import { looseCmd } from '../../city/life';
import { contactChat, contactsOf, type ContactView } from '../../city/people';
import { Avatar, Nothing, type PhoneCtx } from '../shared';

const contactKind = (k: ContactView['kind']) =>
  ({
    fund: t('Investor'),
    founder: t('Founder'),
    talent: t('Looking for work'),
    customer: t('Customer'),
    player: t('Player'),
    local: t('In town'),
  })[k];

/** The id `home.invite` takes for a contact: their chat id, a fund, or their ref. */
export const inviteId = (c: ContactView) =>
  c.chatId ?? (c.kind === 'fund' ? `fund:${c.refId}` : c.refId);

export function Contacts({ ctx }: { ctx: PhoneCtx }) {
  const { view, send } = useView();
  const contacts = contactsOf(view);
  const [armed, setArmed] = useState<string | null>(null);
  if (contacts.length === 0)
    return (
      <Nothing icon="contacts">
        {t('No contacts yet. Go into a café, a bar or the Hub and save who you meet.')}
      </Nothing>
    );
  return (
    <>
      {ctx.invite && (
        <p className="phone-note" role="status">
          {t('Who do you want to invite over? Snacks cost a little; it lifts your social life.')}
        </p>
      )}
      <ul className="phone-list" aria-label={t('Contacts')}>
        {contacts.map((c) => {
          const r = contactChat(c, view);
          return (
            <li key={c.id} className="phone-contact" data-contact={c.chatId ?? c.refId}>
              <div className="phone-row static">
                <Avatar name={c.name} ai={!(r && 'player' in r)} />
                <span className="phone-row-main">
                  <span className="item-title">{c.name}</span>
                  <span className="small muted">
                    {c.chatId?.startsWith('biz:') ? t('Business owner') : contactKind(c.kind)}
                  </span>
                  <Bar value={c.warmth} label={t('Contact warmth')} tone="good" />
                </span>
              </div>
              <div className="row phone-contact-actions">
                <Button variant="subtle" disabled={!r} onClick={() => r && ctx.chat(r)}>
                  {t('Chat')}
                </Button>
                <Button
                  variant={ctx.invite ? 'primary' : 'subtle'}
                  onClick={() =>
                    void send(looseCmd({ type: 'home.invite', personId: inviteId(c) }), () =>
                      t('{name} is coming over.', { name: c.name }),
                    )
                  }
                >
                  {t('Invite over')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (armed !== c.id) return setArmed(c.id);
                    setArmed(null);
                    void send(looseCmd({ type: 'contact.remove', contactId: c.id }), () =>
                      t('{name} is no longer in your contacts.', { name: c.name }),
                    );
                  }}
                >
                  {armed === c.id ? t('Tap again to remove') : t('Remove')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
