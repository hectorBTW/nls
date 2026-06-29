import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { plan, os } = req.body;

  const prices = {
    basic: "price_BASIC_ID",
    standard: "price_STANDARD_ID",
    pro: "price_PRO_ID",
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price: prices[plan],
        quantity: 1,
      },
    ],
    metadata: {
      plan,
      os,
    },
    success_url: "https://tuweb.vercel.app/success",
    cancel_url: "https://tuweb.vercel.app/cancel",
  });

  res.json({ url: session.url });
}