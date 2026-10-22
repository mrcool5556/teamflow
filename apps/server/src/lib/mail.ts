import nodemailer from "nodemailer";
import { config } from "../config.js";

export function isSmtpConfigured() {
  return config.smtp !== null;
}

export function getPublicBaseUrl() {
  return config.publicUrl;
}

function createTransport() {
  const smtp = config.smtp;
  if (!smtp) {
    throw new Error("SMTP_HOST is not set");
  }
  if (!smtp.user || !smtp.pass) {
    throw new Error("SMTP_USER and SMTP_PASS are required when SMTP_HOST is set");
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!config.smtp) {
    return false;
  }

  const from = config.smtp.from;
  const transport = createTransport();
  await transport.sendMail({
    from,
    to,
    subject: "Reset your Teamflow password",
    text: [
      "You requested a password reset for Teamflow.",
      "",
      resetUrl,
      "",
      "This link expires in 1 hour. If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>You requested a password reset for Teamflow.</p>",
      `<p><a href="${resetUrl}">Reset your password</a></p>`,
      "<p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>",
    ].join(""),
  });
  return true;
}
