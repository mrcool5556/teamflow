import nodemailer from "nodemailer";

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim());
}

export function getPublicBaseUrl() {
  return (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function createTransport() {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user
      ? { user, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!isSmtpConfigured()) {
    return false;
  }

  const from = process.env.SMTP_FROM?.trim() ?? "teamflow@localhost";
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
