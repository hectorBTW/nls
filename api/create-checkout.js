import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    console.log("REQ METHOD:", req.method);
    console.log("RAW BODY:", req.body);

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;

    const { plan, os } = body || {};

    const prices = {
      basic: "price_1TnPKh8i4wOJdpsZ175IIcfa",
      standard: "price_1TnPL98i4wOJdpsZpF1jiFI0",
      pro: "price_1TnPLK8i4wOJdpsZkJRFQHkz",
    };

    if (!prices[plan]) {
      return res.status(400).json({ error: "Invalid plan", plan });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: prices[plan],
          quantity: 1,
        },
      ],
      metadata: { plan, os },
      success_url: "https://nls-a1kl704b3-hectorbtws-projects.vercel.app/",
      cancel_url: "https://nls-a1kl704b3-hectorbtws-projects.vercel.app/",
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("FULL ERROR:", err);

    return res.status(500).json({
      error: err.message || "unknown error",
    });
  }
}
