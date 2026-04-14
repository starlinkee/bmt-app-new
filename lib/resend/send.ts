import { render } from "@react-email/components";
import { getResend } from "./client";
import { WelcomeEmail } from "./emails/welcome";

interface SendWelcomeEmailParams {
  to: string;
  name?: string;
}

export async function sendWelcomeEmail({ to, name }: SendWelcomeEmailParams) {
  const html = await render(WelcomeEmail({ name }));

  return getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
    subject: "Welcome!",
    html,
  });
}
