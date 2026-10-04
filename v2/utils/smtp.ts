import { logger } from "@/v2/utils/logger";
import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

const configured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

// One pooled, rate-limited connection: bulk sends (hundreds of residents) stay under provider throttles.
const transport = configured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: Number(SMTP_PORT) === 465,
      requireTLS: Number(SMTP_PORT ?? 587) !== 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      pool: true,
      maxConnections: 1,
      rateDelta: 1000,
      rateLimit: 2,
    })
  : null;

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendMail(mail: Mail) {
  if (!transport) throw new Error(`SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS).`);
  const info = await transport.sendMail({ from: MAIL_FROM ?? SMTP_USER, ...mail });
  logger.info(`Mail sent to ${mail.to}: ${info.messageId}`);
  return info;
}

async function verifySmtp() {
  if (!transport) throw new Error(`SMTP is not configured.`);
  return transport.verify();
}

function closeSmtp() {
  transport?.close();
}

export { closeSmtp, sendMail, verifySmtp, configured as smtpConfigured };
