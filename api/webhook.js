import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

export default async function handler(req, res) {
  console.log("🔥 WEBHOOK HIT");

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const sig = req.headers["stripe-signature"];
  const buf = await buffer(req);

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("EVENT TYPE:", event.type);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("💰 PAYMENT OK");
      console.log("PLAN:", session.metadata?.plan);
      console.log("OS:", session.metadata?.os);
      console.log("EMAIL:", session.customer_details?.email);

      // ENVIAR EMAIL CON RESEND
      const message = `
NUEVO VPS PEDIDO

Plan: ${session.metadata?.plan}
OS: ${session.metadata?.os}
Email: ${session.customer_details?.email}
      `;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "NLS Cloud <noreply@tudominio.com>",
          to: "nolimitsystems41@gmail.com",
          subject: "Nuevo VPS comprado",
          text: message,
        }),
      });

      console.log("📧 EMAIL SENT");
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return res.status(500).send("Server error");
  }
}
