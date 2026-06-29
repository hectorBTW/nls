import Stripe from "stripe";
import fetch from "node-fetch";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const event = req.body;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const plan = session.metadata.plan;
    const os = session.metadata.os;
    const email = session.customer_details.email;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NLS Cloud <noreply@tudominio.com>",
        to: "TU_EMAIL@gmail.com",
        subject: "Nuevo VPS comprado",
        text: `Plan: ${plan}\nOS: ${os}\nEmail: ${email}`,
      }),
    });
  }

  res.json({ received: true });
}