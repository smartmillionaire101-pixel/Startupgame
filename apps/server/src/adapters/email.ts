/**
 * Email provider port, for sign-in links. Picked from the environment:
 *
 * - RESEND_API_KEY (+ EMAIL_FROM): Resend's HTTP API.
 * - SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM): any SMTP server,
 *   e.g. a free Gmail account with an App Password (smtp.gmail.com:465).
 * - Neither: the dev provider, which only logs (and is not "real").
 */
import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  /** False for the dev provider: nothing actually leaves the server. */
  readonly real: boolean;
  send(msg: EmailMessage): Promise<void>;
}

export interface EmailEnv {
  RESEND_API_KEY?: string | undefined;
  SMTP_HOST?: string | undefined;
  SMTP_PORT?: number | undefined;
  SMTP_USER?: string | undefined;
  SMTP_PASS?: string | undefined;
  EMAIL_FROM?: string | undefined;
}

export class DevEmailProvider implements EmailProvider {
  readonly real = false;
  constructor(private readonly log: (msg: string) => void) {}
  async send(msg: EmailMessage) {
    // Never log the link itself: it is a key to the account.
    const [user, domain] = msg.to.split('@');
    this.log(`[dev email] to ${user?.slice(0, 1)}***@${domain}: ${msg.subject}`);
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly real = true;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(msg: EmailMessage) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  }
}

export class SmtpEmailProvider implements EmailProvider {
  readonly real = true;
  private readonly transport: Transporter;
  constructor(
    opts: { host: string; port: number; user?: string; pass?: string },
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      // 465 is TLS from the start (Gmail); 587 upgrades with STARTTLS.
      secure: opts.port === 465,
      requireTLS: opts.port !== 465,
      ...(opts.user ? { auth: { user: opts.user, pass: opts.pass ?? '' } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  async send(msg: EmailMessage) {
    await this.transport.sendMail({ from: this.from, ...msg });
  }
}

export function emailProviderFrom(env: EmailEnv, log: (msg: string) => void): EmailProvider {
  const from = env.EMAIL_FROM || (env.SMTP_USER ? `Runway <${env.SMTP_USER}>` : '');
  if (env.RESEND_API_KEY && from) return new ResendEmailProvider(env.RESEND_API_KEY, from);
  if (env.SMTP_HOST && from)
    return new SmtpEmailProvider(
      {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 465,
        ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
        ...(env.SMTP_PASS ? { pass: env.SMTP_PASS } : {}),
      },
      from,
    );
  return new DevEmailProvider(log);
}

/** Addresses that can never receive mail (RFC 2606/6761): tests use these. */
export function isReservedAddress(email: string): boolean {
  const domain = email.split('@')[1] ?? '';
  return (
    /(^|\.)example\.(com|org|net)$/.test(domain) ||
    /\.(test|invalid|localhost|example)$/.test(domain)
  );
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The sign-in email, in English or French. */
export function signInEmail(
  to: string,
  link: string,
  intent: 'login' | 'save',
  lang: 'en' | 'fr',
): EmailMessage {
  const fr = lang === 'fr';
  const subject = fr ? 'Votre lien de connexion Runway' : 'Your Runway sign-in link';
  const lead = fr
    ? intent === 'save'
      ? 'Ouvrez ce lien pour enregistrer votre partie Runway avec cette adresse :'
      : 'Ouvrez ce lien pour vous connecter à Runway :'
    : intent === 'save'
      ? 'Open this link to save your Runway game with this email:'
      : 'Open this link to sign in to Runway:';
  const button = fr ? 'Ouvrir Runway' : 'Open Runway';
  const expires = fr ? 'Le lien expire dans 15 minutes.' : 'The link expires in 15 minutes.';
  const ignore = fr
    ? 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.'
    : 'If this wasn’t you, you can ignore this email.';
  const text = `${lead}\n\n${link}\n\n${expires}\n${ignore}\n\nRunway`;
  const html = `<!doctype html><html lang="${lang}"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<p>${escapeHtml(lead)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(button)}</a></p>
<p style="font-size:13px;color:#555">${escapeHtml(link)}</p>
<p style="font-size:13px;color:#555">${escapeHtml(expires)}<br>${escapeHtml(ignore)}</p>
<p>Runway</p>
</body></html>`;
  return { to, subject, text, html };
}
