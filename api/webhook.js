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
const GRACE_PERIOD_DAYS = 30;

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

async function handleCheckoutCompleted(session) {
  const plan = session.metadata?.plan;
  const os = session.metadata?.os;
  const user_id = session.metadata?.user_id;

  // En modo "subscription", session.subscription y session.customer
  // ya vienen rellenos en este evento.
  const stripe_subscription_id = session.subscription || null;
  const stripe_customer_id = session.customer || null;

  console.log("Payment OK");
  console.log("PLAN:", plan);
  console.log("OS:", os);
  console.log("USER_ID:", user_id);

  // 1. Buscar el email del usuario en Supabase usando su user_id
  //    (no lo pedimos a Stripe, ya lo tenemos en la cuenta del usuario).
  let userEmail = null;
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(user_id);

  if (userError) {
    console.error("Error buscando usuario:", userError);
  } else {
    userEmail = userData?.user?.email ?? null;
  }

  // 2. Guardar la VM en Supabase, asociada al user_id.
  const { data: vm, error: insertError } = await supabaseAdmin
    .from("vms")
    .insert({
      user_id,
      plan,
      os,
      stripe_subscription_id,
      stripe_customer_id,
      status: "provisioning",
      status_message: "Esperando creación en Proxmox",
    })
    .select()
    .single();

  if (insertError) {
    // No devolvemos error a Stripe por esto, si no, Stripe reintentará
    // el webhook entero. Solo lo logueamos para revisarlo a mano.
    console.error("Error guardando VM:", insertError);
    return;
  }

  console.log("VM guardada en Supabase:", vm.id);

  // 2.5 Meter el pedido en la cola para que el worker (en el LXC
  //     de Proxmox) lo recoja y cree la VM de verdad.
  try {
    await redis.lpush(
      QUEUE_KEY,
      JSON.stringify({ type: "provision", vm_id: vm.id, plan, os, user_id })
    );
    console.log("Mensaje encolado en Redis:", vm.id);
  } catch (queueError) {
    console.error("Error encolando en Redis:", queueError);
  }

  // 3. Mandar el email de aviso solo si se creó la VM en la BD
  const message = `
Nuevo VPS:
Plan: ${plan}
OS: ${os}
Usuario: ${userEmail ?? "desconocido"}
VM ID: ${vm?.id ?? "N/A"}
    `;

  try {
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
    console.log("Email sent. RESEND STATUS:", response.status);
  } catch (emailError) {
    console.error("Error enviando email:", emailError);
  }
}

async function handleSubscriptionDeleted(subscription) {
  const stripe_subscription_id = subscription.id;

  console.log("Subscripción cancelada:", stripe_subscription_id);

  const { data: vms, error: findError } = await supabaseAdmin
    .from("vms")
    .select("id, proxmox_node, proxmox_vmid, subscription_status")
    .eq("stripe_subscription_id", stripe_subscription_id);

  if (findError) {
    console.error("Error buscando VM para cancelar:", findError);
    return;
  }

  if (!vms || vms.length === 0) {
    console.warn(
      "No se encontró ninguna VM con stripe_subscription_id:",
      stripe_subscription_id
    );
    return;
  }

  for (const vm of vms) {
    if (vm.subscription_status === "cancelled") {
      console.log(`vm_id=${vm.id} ya tenía subscription_status=cancelled, se ignora`);
      continue;
    }

    const now = new Date();
    const deletionDate = new Date(now);
    deletionDate.setDate(deletionDate.getDate() + GRACE_PERIOD_DAYS);

    // subscription_status refleja lo que ya es un hecho consumado en Stripe.
    // status (running/stopped/etc.) es independiente y lo actualizará el
    // worker cuando de verdad apague la VM en Proxmox.
    const { error: updateError } = await supabaseAdmin
      .from("vms")
      .update({
        subscription_status: "cancelled",
        status_message: "Suscripción cancelada, apagando VM",
        cancelled_at: now.toISOString(),
        pending_deletion: true,
        deletion_scheduled_at: deletionDate.toISOString(),
      })
      .eq("id", vm.id);

    if (updateError) {
      console.error(`Error marcando vm_id=${vm.id} como cancelada:`, updateError);
      continue;
    }

    try {
      await redis.lpush(
        QUEUE_KEY,
        JSON.stringify({
          type: "stop",
          vm_id: vm.id,
          proxmox_node: vm.proxmox_node,
          proxmox_vmid: vm.proxmox_vmid,
        })
      );
      console.log(`Job de apagado encolado para vm_id=${vm.id}`);
    } catch (queueError) {
      console.error(`Error encolando apagado para vm_id=${vm.id}:`, queueError);
    }
  }
}

export default async function handler(req, res) {
  console.log("Webhook hit");

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
    console.error("Firma inválida:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log("EVENT TYPE:", event.type);

    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send(err.message);
  }
}
