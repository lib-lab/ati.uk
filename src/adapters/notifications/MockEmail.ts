import type { EmailChannel } from './EmailChannel';

export interface SentEmail {
  to: string;
  subject: string;
  body: string;
}

/** Keeps messages in memory instead of sending. */
export class MockEmail implements EmailChannel {
  readonly sent: SentEmail[] = [];

  async send(to: string, subject: string, body: string): Promise<void> {
    this.sent.push({ to, subject, body });
  }
}
