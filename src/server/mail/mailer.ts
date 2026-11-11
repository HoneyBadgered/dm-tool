export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Prints mail to the server log. Swap in an SMTP mailer later without touching callers. */
export const consoleMailer: Mailer = {
  async send(mail) {
    console.info(
      `\n[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n${mail.text}\n`,
    );
  },
};

export function getMailer(): Mailer {
  return consoleMailer;
}
