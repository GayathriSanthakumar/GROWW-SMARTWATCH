import nodemailer from "nodemailer";
import { config } from "../config.js";

// Sends the news digest via SMTP if configured; otherwise returns a preview so
// the feature works end-to-end in the offline/demo build.

export interface SendResult {
  sent: boolean;
  mode: "sent" | "preview";
  messageId?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const t = getTransporter();
  if (!t) {
    // No SMTP configured — log and return preview mode.
    console.log(`[email] (preview) to=${to} subject="${subject}"\n${stripHtml(html).slice(0, 300)}…`);
    return { sent: false, mode: "preview" };
  }
  const info = await t.sendMail({ from: config.smtp.from, to, subject, html });
  return { sent: true, mode: "sent", messageId: info.messageId };
}

export function smtpConfigured(): boolean {
  return !!config.smtp.host;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
