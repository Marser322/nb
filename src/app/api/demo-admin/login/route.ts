import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEMO_NAME = "Admin Demo";
const DEFAULT_DEMO_EMAIL = "demo@nbbarber.uy";
const DEFAULT_DEMO_PASSWORD = "DemoNB2026!";

const PROFILE_GRANT_HINT = [
  "No se pudo reparar el perfil admin demo porque service_role no tiene permisos sobre public.profiles.",
  "Aplicá la migración demo_admin_service_role_grant o ejecutá:",
  "GRANT USAGE ON SCHEMA public TO service_role;",
  "GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO service_role;",
].join(" ");

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type DemoConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  email: string;
  password: string;
};

type SupabaseAdminClient = SupabaseClient;

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function getDemoConfig(): DemoConfig | NextResponse {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return jsonError(403, "demo_mode_disabled", "El modo demo no está activo.");
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.DEMO_ADMIN_EMAIL || process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || DEFAULT_DEMO_EMAIL;
  const password =
    process.env.DEMO_ADMIN_PASSWORD || process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || DEFAULT_DEMO_PASSWORD;

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!email) missing.push("DEMO_ADMIN_EMAIL o NEXT_PUBLIC_DEMO_ADMIN_EMAIL");
  if (!password) missing.push("DEMO_ADMIN_PASSWORD o NEXT_PUBLIC_DEMO_ADMIN_PASSWORD");

  if (missing.length > 0) {
    return jsonError(500, "demo_config_missing", `Falta configurar: ${missing.join(", ")}.`);
  }

  if (!supabaseUrl || !anonKey || !email || !password) {
    return jsonError(500, "demo_config_missing", "Faltan variables de entorno para el modo demo.");
  }

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    email,
    password,
  };
}

function isNextResponse(value: DemoConfig | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProfilePermissionError(error: unknown) {
  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [maybeError.code, maybeError.message, maybeError.details, maybeError.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return maybeError.code === "42501" || text.includes("permission denied");
}

function publicProvisionMessage(error: unknown) {
  if (isProfilePermissionError(error)) {
    return PROFILE_GRANT_HINT;
  }

  const message = error instanceof Error ? error.message : "Error desconocido";
  return `No se pudo crear o reparar el Admin demo. Detalle: ${message}`;
}

async function findUserByEmail(
  admin: SupabaseAdminClient,
  email: string
): Promise<User | null> {
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

async function createOrUpdateDemoUser(config: DemoConfig): Promise<User> {
  if (!config.serviceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  }

  const admin = createSupabaseAdminClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: config.email,
    password: config.password,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });

  if (!createError) {
    if (!created?.user) throw new Error("Supabase no devolvió el usuario demo creado.");
    return created.user;
  }

  const existingUser = await findUserByEmail(admin, config.email);
  if (!existingUser) throw createError;

  const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
    password: config.password,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });

  if (updateError) throw updateError;
  return updated.user ?? existingUser;
}

async function updateDemoProfile(
  admin: SupabaseAdminClient,
  userId: string
) {
  const { data, error } = await admin
    .from("profiles")
    .update({ role: "admin", full_name: DEMO_NAME })
    .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
    .select("id");

  if (error) throw error;
  return data?.length ? data[0] : null;
}

async function ensureDemoProfile(config: DemoConfig, userId: string) {
  if (!config.serviceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  }

  const admin = createSupabaseAdminClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const profile = await updateDemoProfile(admin, userId);
    if (profile) return;
    await sleep(400);
  }

  const { error } = await admin.from("profiles").insert({
    auth_user_id: userId,
    role: "admin",
    full_name: DEMO_NAME,
  });

  if (error) {
    if (error.code === "23505") {
      const profile = await updateDemoProfile(admin, userId);
      if (profile) return;
    }

    throw error;
  }
}

async function provisionDemoAdmin(config: DemoConfig) {
  const user = await createOrUpdateDemoUser(config);
  await ensureDemoProfile(config, user.id);
}

function applyCookies(response: NextResponse, cookiesToSet: CookieToSet[]) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
}

async function signInDemoAdmin(request: NextRequest, config: DemoConfig) {
  const cookiesToSet: CookieToSet[] = [];
  const supabase = createServerClient(config.supabaseUrl, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies) {
        cookiesToSet.push(...nextCookies);
      },
    },
  });

  const {
    data: { user },
    error: signInError,
  } = await supabase.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });

  if (signInError || !user) {
    return {
      ok: false as const,
      response: jsonError(
        401,
        "demo_signin_failed",
        "No se pudo iniciar la demo. Si es el primer acceso, configurá SUPABASE_SERVICE_ROLE_KEY para auto-crear el usuario."
      ),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    await supabase.auth.signOut();
    const response = jsonError(
      403,
      "demo_profile_not_admin",
      "El usuario demo existe, pero todavía no tiene permisos de administrador."
    );
    applyCookies(response, cookiesToSet);
    return { ok: false as const, response };
  }

  const response = NextResponse.json({ ok: true });
  applyCookies(response, cookiesToSet);
  return { ok: true as const, response };
}

export async function POST(request: NextRequest) {
  const config = getDemoConfig();
  if (isNextResponse(config)) return config;

  let provisionError: unknown = null;

  if (config.serviceRoleKey) {
    try {
      await provisionDemoAdmin(config);
    } catch (error) {
      provisionError = error;
      console.error("Demo admin provisioning failed:", error);
    }
  }

  const signInResult = await signInDemoAdmin(request, config);
  if (signInResult.ok) return signInResult.response;

  if (provisionError) {
    return jsonError(500, "demo_provision_failed", publicProvisionMessage(provisionError));
  }

  if (!config.serviceRoleKey) {
    return jsonError(
      500,
      "demo_service_role_missing",
      "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Sin esa clave solo funciona si el Admin demo ya fue creado previamente."
    );
  }

  return signInResult.response;
}
