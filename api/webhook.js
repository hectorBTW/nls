import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  console.log("🔥 WEBHOOK HIT");

  try {
    const event = req.body;

    console.log("EVENT TYPE:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("💰 PAYMENT OK");
      console.log("PLAN:", session.metadata?.plan);
      console.log("OS:", session.metadata?.os);

      const message = `
Nuevo VPS:

Plan: ${session.metadata?.plan}
OS: ${session.metadata?.os}
Email: ${session.customer_details?.email}
      `;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "onboarding@resend.dev",
          to: "TU_EMAIL_REAL@gmail.com",
          subject: "Nuevo VPS comprado",
          text: message,
        }),
      });

      console.log("📧 EMAIL SENT");
      console.log("RESEND STATUS:", response.status);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return res.status(500).send(err.message);
  }
}
