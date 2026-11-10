import nodemailer from "nodemailer";
import { getPublicUrl, getSiteName, getSmtpConfig } from "./siteSettings.js";

/** Email is set up in .env or on the admin page (Site & email). */
export function isSmtpConfigured() {
  return getSmtpConfig() !== null;
}

export function getPublicBaseUrl() {
  return getPublicUrl();
}

function createTransport() {
  const smtp = getSmtpConfig();
  if (!smtp) {
    throw new Error("Email is not set up");
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS,
    ignoreTLS: smtp.ignoreTLS,
    // Some relays on a private network take mail without a login.
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const smtp = getSmtpConfig();
  if (!smtp) {
    return false;
  }

  const site = getSiteName();
  const transport = createTransport();
  await transport.sendMail({
    from: smtp.from,
    to,
    subject: `Reset your ${site} password`,
    text: [
      `You requested a password reset for ${site}.`,
      "",
      resetUrl,
      "",
      "This link expires in 1 hour. If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      `<p>You requested a password reset for ${escapeHtml(site)}.</p>`,
      `<p><a href="${resetUrl}">Reset your password</a></p>`,
      "<p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>",
    ].join(""),
  });
  return true;
}

/** The admin page's "Send a test" button. Throws with the SMTP server's own message. */
export async function sendTestEmail(to: string) {
  const smtp = getSmtpConfig();
  if (!smtp) throw new Error("Email is not set up");
  const site = getSiteName();
  await createTransport().sendMail({
    from: smtp.from,
    to,
    subject: `${site}: test email`,
    text: `This is a test from ${site} at ${getPublicUrl()}. Email works.`,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
