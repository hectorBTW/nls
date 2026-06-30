import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// IMPORTANTE: para verificar la firma de Stripe necesitamos el body "crudo",
// sin parsear. Por eso desactivamos el bodyParser por defecto de Vercel.
export const config = {
  api: {
    bodyParser: false,
  },
};

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  console.log("🔥 WEBHOOK HIT");

  let event;

  try {
    const rawBody = await buffer(req);
    const signature = req.headers["stripe-signature"];

    // Esto comprueba que el aviso viene realmente de Stripe y no de
    // alguien mandando un POST falso a esta URL.
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ FIRMA INVÁLIDA:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log("EVENT TYPE:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const plan = session.metadata?.plan;
      const os = session.metadata?.os;
      const user_id = session.metadata?.user_id;
      const email = session.customer_details?.email;

      console.log("💰 PAYMENT OK");
      console.log("PLAN:", plan);
      console.log("OS:", os);

      // 1. Guardar la orden en Supabase, esto es lo que dispara
      //    (más adelante) la creación de la VM por el worker.
      const { data: order, error: insertError } = await supabaseAdmin
        .from("orders")
        .insert({
          user_id,
          email,
          plan,
          os,
          stripe_session_id: session.id,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        // No paramos el webhook por esto: Stripe seguirá reintentando si
        // devolvemos error, así que solo lo logueamos para revisarlo.
        console.error("❌ ERROR GUARDANDO ORDEN:", insertError);
      } else {
        console.log("✅ ORDEN GUARDADA:", order.id);
      }

      // 2. Mandar el email de aviso (como ya tenías)
      const message = `
Nuevo VPS:
Plan: ${plan}
OS: ${os}
Email: ${email}
Order ID: ${order?.id ?? "N/A"}
      `;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "onboarding@resend.dev",
          to: "nolimitsystems41@gmail.com",
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
