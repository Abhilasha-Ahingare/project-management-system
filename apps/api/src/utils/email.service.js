import nodemailer from "nodemailer";
import env from "../config/env.js";

const hasSmtpConfig =
  env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPassword;

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPassword,
      },
    })
  : null;

export const verifyEmailTransport = async () => {
  if (!transporter) {
    console.warn(
      "[ProjectHub Email] SMTP is not configured; email delivery is disabled",
    );
    return false;
  }

  try {
    await transporter.verify();
    console.info("[ProjectHub Email] SMTP connection verified");
    return true;
  } catch (error) {
    console.error("[ProjectHub Email] SMTP verification failed", {
      code: error.code,
      responseCode: error.responseCode,
      message: error.message,
    });
    return false;
  }
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const buildInvitationEmail = ({
  recipientName,
  inviterName,
  targetType,
  targetName,
  invitationId,
  expiresAt,
}) => {
  const actionUrl = `${env.clientUrl}/notifications?invitationId=${invitationId}`;
  const expiry = new Date(expiresAt).toLocaleString();
  const safeRecipientName = escapeHtml(recipientName);
  const safeInviterName = escapeHtml(inviterName);
  const safeTargetType = escapeHtml(targetType.toLowerCase());
  const safeTargetName = escapeHtml(targetName);
  const safeExpiry = escapeHtml(expiry);

  return {
    subject: `You have been invited to ${targetName}`,
    text: `Hi ${recipientName},\n\n${inviterName} invited you to join ${targetType.toLowerCase()} "${targetName}" on ProjectHub.\n\nReview and respond here: ${actionUrl}\n\nThis invitation expires on ${expiry}.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:560px"><h2>ProjectHub invitation</h2><p>Hi ${safeRecipientName},</p><p><strong>${safeInviterName}</strong> invited you to join the ${safeTargetType} <strong>${safeTargetName}</strong>.</p><p><a href="${actionUrl}" style="display:inline-block;background:#1f766e;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Review invitation</a></p><p>This invitation expires on <strong>${safeExpiry}</strong> and can only be accepted once.</p><p>If you were not expecting this invitation, you can reject it from your ProjectHub notifications.</p></div>`,
  };
};

export const sendInvitationEmail = async ({
  recipient,
  inviter,
  targetType,
  targetName,
  invitationId,
  expiresAt,
}) => {
  const email = buildInvitationEmail({
    recipientName: recipient.name,
    inviterName: inviter.name,
    targetType,
    targetName,
    invitationId,
    expiresAt,
  });

  if (!transporter) {
    console.info("[ProjectHub Email] SMTP not configured; preview", {
      to: recipient.email,
      subject: email.subject,
      invitationId: invitationId.toString(),
      expiresAt,
    });
    return { delivered: false, preview: true };
  }

  const result = await transporter.sendMail({
    from: env.mailFrom,
    to: recipient.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  console.info("[ProjectHub Email] invitation sent", {
    to: recipient.email,
    messageId: result.messageId,
  });
  return { delivered: true, preview: false };
};

export const sendNotificationEmail = async (notification) => {
  const recipient = notification.recipient;
  const subject = notification.title || "ProjectHub notification";
  const text = `Hi ${recipient.name},\n\n${notification.message}\n\nOpen ProjectHub: ${env.clientUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:560px"><h2>${escapeHtml(subject)}</h2><p>Hi ${escapeHtml(recipient.name)},</p><p>${escapeHtml(notification.message)}</p><p><a href="${env.clientUrl}" style="display:inline-block;background:#1f766e;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Open ProjectHub</a></p></div>`;

  if (!transporter) {
    console.info("[ProjectHub Email] SMTP not configured; preview", {
      to: recipient.email,
      subject,
      notificationId: notification._id.toString(),
    });
    return { delivered: false, preview: true };
  }

  const result = await transporter.sendMail({
    from: env.mailFrom,
    to: recipient.email,
    subject,
    text,
    html,
  });
  console.info("[ProjectHub Email] notification sent", {
    to: recipient.email,
    messageId: result.messageId,
  });
  return { delivered: true, preview: false };
};
