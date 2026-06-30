import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Cliente de Supabase en el backend, usando la SERVICE ROLE KEY
// (nunca la anon key aquí, y nunca expuesta al frontend)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1. Extraer el token del header Authorization: "Bearer <token>"
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "No autenticado" });
    }

    // 2. Verificar el token contra Supabase
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({ error: "Sesión inválida o expirada" });
    }

    const user = userData.user;

    // 3. Parsear body
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { plan, os } = body || {};

    const prices = {
      basic: "price_1TnPKh8i4wOJdpsZ175IIcfa",
      standard: "price_1TnPL98i4wOJdpsZpF1jiFI0",
      pro: "price_1TnPLK8i4wOJdpsZkJRFQHkz",
    };

    if (!prices[plan]) {
      return res.status(400).json({ error: "Invalid plan", plan });
    }

    // 4. Crear el checkout, ahora ya sabemos que el usuario es real
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: prices[plan],
          quantity: 1,
        },
      ],
      metadata: { plan, os, user_id: user.id, email: user.email },
      customer_email: user.email,
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
