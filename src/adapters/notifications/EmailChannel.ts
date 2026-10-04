/** Outgoing e-mail for subscriptions and reminders. */
export interface EmailChannel {
  send(to: string, subject: string, body: string): Promise<void>;
}
