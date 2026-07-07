// Provisiona el admin de demostracion de forma idempotente.
// Uso: npm run seed:demo-admin
// Requiere: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
// Nunca commitear la service role key ni exponerla en el front / Vercel.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "demo@nbbarber.uy";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || "DemoNB2026!";
const DEMO_NAME = "Admin Demo";

const PROFILE_GRANT_HINT = [
  "Supabase no permitio escribir en public.profiles con service_role.",
  "Aplica la migracion demo_admin_service_role_grant o ejecuta en SQL Editor:",
  "  GRANT USAGE ON SCHEMA public TO service_role;",
  "  GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO service_role;",
].join("\n");

const missingEnv = [];
if (!SUPABASE_URL) missingEnv.push("SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL");
if (!SERVICE_ROLE_KEY) missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");

if (missingEnv.length > 0) {
  console.error(`Falta ${missingEnv.join(" y ")} en el entorno.`);
  console.error("Uso recomendado: npm run seed:demo-admin");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProfilePermissionError(error) {
  const text = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return error?.code === "42501" || text.includes("permission denied");
}

function withProfileGrantHint(error) {
  if (!isProfilePermissionError(error)) return error;

  const message = error?.message ? `${PROFILE_GRANT_HINT}\n\nDetalle: ${error.message}` : PROFILE_GRANT_HINT;
  return new Error(message);
}

async function findUserByEmail(email) {
  const targetEmail = email.toLowerCase();

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (found) return found;
    if (users.length < 200) return null;
  }
}

async function createOrUpdateDemoUser() {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });

  if (!createErr) {
    if (!created?.user) {
      throw new Error("Supabase no devolvio el usuario creado.");
    }

    console.log("Usuario demo creado.");
    return created.user;
  }

  const user = await findUserByEmail(DEMO_EMAIL);
  if (!user) throw createErr;

  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });
  if (updateErr) throw updateErr;

  console.log("Usuario demo ya existia; password/confirmacion reseteados.");
  return user;
}

async function updateDemoProfile(userId) {
  const { data, error } = await admin
    .from("profiles")
    .update({ role: "admin", full_name: DEMO_NAME })
    .eq("auth_user_id", userId)
    .select("id");

  if (error) throw withProfileGrantHint(error);
  return data?.length ? data[0] : null;
}

async function ensureDemoProfile(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const profile = await updateDemoProfile(userId);
    if (profile) return;
    await sleep(400);
  }

  const { error } = await admin
    .from("profiles")
    .insert({ auth_user_id: userId, role: "admin", full_name: DEMO_NAME });

  if (error) {
    if (error.code === "23505") {
      const profile = await updateDemoProfile(userId);
      if (profile) return;
    }

    throw withProfileGrantHint(error);
  }
}

async function verifyDemoProfile(userId) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw withProfileGrantHint(error);
  if (data?.role !== "admin") {
    throw new Error(`El profile demo no quedo como admin (role actual: ${data?.role ?? "sin profile"}).`);
  }
}

async function main() {
  const user = await createOrUpdateDemoUser();
  await ensureDemoProfile(user.id);
  await verifyDemoProfile(user.id);

  console.log(`✔ Admin demo listo: ${DEMO_EMAIL} (role=admin)`);
}

main().catch((error) => {
  console.error("Seed fallo:", error?.message ?? error);
  process.exit(1);
});
