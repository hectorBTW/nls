import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Cliente de Redis (Upstash), funciona por HTTP así que va perfecto
// en una function serverless de Vercel.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const QUEUE_KEY = "provision-vm-queue";

// Necesitamos el body "crudo" (sin parsear) para poder verificar
// la firma de Stripe. Por eso desactivamos el bodyParser de Vercel.
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

    // Comprueba que el aviso viene realmente de Stripe, y no de alguien
    // mandando un POST falso a esta URL simulando un pago.
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

      // En modo "subscription", session.subscription y session.customer
      // ya vienen rellenos en este evento.
      const stripe_subscription_id = session.subscription || null;
      const stripe_customer_id = session.customer || null;

      console.log("💰 PAYMENT OK");
      console.log("PLAN:", plan);
      console.log("OS:", os);
      console.log("USER_ID:", user_id);

      // 1. Buscar el email del usuario en Supabase usando su user_id
      //    (no lo pedimos a Stripe, ya lo tenemos en la cuenta del usuario).
      let userEmail = null;
      const { data: userData, error: userError } =
        await supabaseAdmin.auth.admin.getUserById(user_id);

      if (userError) {
        console.error("❌ ERROR BUSCANDO USUARIO:", userError);
      } else {
        userEmail = userData?.user?.email ?? null;
      }

      // 2. Guardar la VM en Supabase, asociada al user_id.
      //    Esto es lo que más adelante leerá el worker para crear la VM
      //    de verdad en Proxmox.
      const { data: vm, error: insertError } = await supabaseAdmin
        .from("vms")
        .insert({
          user_id,
          plan,
          os,
          stripe_subscription_id,
          stripe_customer_id,
          status: "pending",
          status_message: "Esperando creación en Proxmox",
        })
        .select()
        .single();

      if (insertError) {
        // No devolvemos error a Stripe por esto, si no, Stripe reintentará
        // el webhook entero. Solo lo logueamos para revisarlo a mano.
        console.error("❌ ERROR GUARDANDO VM:", insertError);
      } else {
        console.log("✅ VM GUARDADA:", vm.id);

        // 2.5 Meter el pedido en la cola para que el worker (en el LXC
        //     de Proxmox) lo recoja y cree la VM de verdad.
        try {
          await redis.lpush(
            QUEUE_KEY,
            JSON.stringify({ vm_id: vm.id, plan, os, user_id })
          );
          console.log("📦 MENSAJE ENCOLADO:", vm.id);
        } catch (queueError) {
          console.error("❌ ERROR ENCOLANDO:", queueError);
        }
      }

      // 3. Mandar el email de aviso
      const message = `
Nuevo VPS:
Plan: ${plan}
OS: ${os}
Usuario: ${userEmail ?? "desconocido"}
VM ID: ${vm?.id ?? "N/A"}
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
