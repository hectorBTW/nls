import Stripe from "stripe";

export default async function handler(req, res) {
  try {

    console.log("BODY RAW:", req.body);

    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      return res.status(500).send("Missing STRIPE_SECRET_KEY in Vercel env vars");
    }

    const stripe = new Stripe(stripeKey);

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const { plan, os } = body || {};

    const prices = {
      basic: "price_1TnPKh8i4wOJdpsZ175IIcfa",
      standard: "price_1TnPL98i4wOJdpsZpF1jiFI0",
      pro: "price_1TnPLK8i4wOJdpsZkJRFQHkz"
    };

    if (!prices[plan]) {
      return res.status(400).send("Invalid plan: " + plan);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price: prices[plan],
        quantity: 1
      }],
      metadata: { plan, os },
      success_url: "https://nls-one.vercel.app/",
      cancel_url: "https://nls-one.vercel.app/"
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("FULL ERROR:", err);

    return res.status(500).send(err.message || "Unknown error");
  }
}
