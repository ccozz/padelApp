import { Resend } from 'resend';

const getResendApiKey = () => {
  const apiKey = String(process.env.RESEND_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY no está configurada');
  }

  return apiKey;
};

const resend = new Resend(getResendApiKey());
const FROM_EMAIL = 'padelApp <onboarding@resend.dev>';

const sendEmail = async (toEmail, subject, headline, linkLabel, linkUrl) =>
  resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 12px;">${headline}</h2>
        <p style="margin: 0 0 16px;">Usá el siguiente enlace para completar la acción:</p>
        <p style="margin: 0 0 16px;">
          <a href="${linkUrl}" style="color: #2563eb;">${linkLabel}</a>
        </p>
        <p style="margin: 0; color: #6b7280;">Si no solicitaste esto, ignorá este email.</p>
      </div>
    `,
    text: `${headline}\n\n${linkLabel}: ${linkUrl}\n\nSi no solicitaste esto, ignorá este email.`,
  });

export const sendVerificationEmail = (toEmail, verificationLink) =>
  sendEmail(toEmail, 'Verificá tu cuenta en padelApp', 'Verificación de cuenta', 'Verificar email', verificationLink);

export const sendPasswordResetEmail = (toEmail, resetLink) =>
  sendEmail(toEmail, 'Reset de contraseña en padelApp', 'Restablecer contraseña', 'Restablecer contraseña', resetLink);