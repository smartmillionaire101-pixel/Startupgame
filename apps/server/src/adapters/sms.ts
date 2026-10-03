/**
 * SMS provider port. Production plugs in a real gateway (e.g. Twilio,
 * Africa's Talking) behind this interface. The dev provider only logs.
 */
export interface SmsProvider {
  send(phoneE164: string, text: string): Promise<void>;
}

export class DevSmsProvider implements SmsProvider {
  constructor(private readonly log: (msg: string) => void) {}
  async send(phone: string, text: string) {
    // Never log full numbers, even in development.
    this.log(`[dev sms] to ***${phone.slice(-3)}: ${text}`);
  }
}
