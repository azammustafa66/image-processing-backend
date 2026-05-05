import Mailgen from 'mailgen';
import nodemailer, { type TransportOptions } from 'nodemailer';

const mailGenerator = new Mailgen({
  theme: 'salted',
  product: {
    name: process.env.APP_NAME || 'Image Processing App',
    link: process.env.APP_URL || 'http://localhost:8000',
  },
});

function emailGenerator(
  name: string,
  intro: string,
  instructions?: string,
  buttonText?: string,
  buttonColor?: string,
  redirectLink?: string,
) {
  const action =
    instructions && buttonText && redirectLink
      ? {
          action: {
            instructions,
            button: {
              color: buttonColor ?? '#3869D4',
              text: buttonText,
              link: redirectLink,
            },
          },
        }
      : {};

  return {
    body: {
      name,
      intro,
      ...action,
      outro: `Need help, or have questions? Just reply to this email, we'd love to help.`,
    },
  };
}

export const transporter = nodemailer.createTransport({
  host: process.env.MAILTRAP_HOST,
  port: Number(process.env.MAILTRAP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASS,
  },
} as TransportOptions);

export const sendMail =
  (
    to: string,
    subject: string,
    name: string,
    intro: string,
    instructions?: string,
    buttonText?: string,
    buttonColor?: string,
    redirectLink?: string,
  ) =>
  async () => {
    const email = emailGenerator(name, intro, instructions, buttonText, buttonColor, redirectLink);
    const emailBody = mailGenerator.generate(email);
    const emailText = mailGenerator.generatePlaintext(email);
    await transporter.sendMail({
      from: process.env.MAILTRAP_FROM || process.env.MAILTRAP_USER,
      to,
      subject,
      text: emailText,
      html: emailBody,
    });
  };
