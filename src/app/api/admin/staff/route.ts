import { randomBytes } from "crypto";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

// Alta de staff (barbero/gerente) con usuario de autenticación real.
// Mismo patrón que /api/demo-admin/login: service_role para operaciones de
// auth.admin, corriendo en Node runtime.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CREATABLE_ROLES = ["barbero", "gerente"] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

interface StaffPayload {
  fullName?: string;
  email?: string;
  role?: string;
  phone?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  branchId?: string | null;
  permissionOverrides?: Record<string, boolean>;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function isCreatableRole(role: string | undefined): role is CreatableRole {
  return !!role && (CREATABLE_ROLES as readonly string[]).includes(role);
}

function sanitizePermissionOverrides(
  overrides: Record<string, boolean> | undefined
): Record<string, boolean> {
  if (!overrides) return {};
  const clean: Record<string, boolean> = {};
  for (const key of Object.keys(overrides)) {
    if ((ALL_PERMISSIONS as string[]).includes(key)) {
      clean[key as Permission] = Boolean(overrides[key]);
    }
  }
  return clean;
}

function generateTempPassword(): string {
  // 12 caracteres, base64url — suficiente entropía para una password temporal
  // de un solo uso que se le entrega al admin para pasarle a la persona.
  return randomBytes(9).toString("base64url");
}

function getAdminEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { supabaseUrl, serviceRoleKey };
}

function isDuplicateEmailError(error: unknown) {
  const maybeError = error as { code?: string; message?: string };
  const text = [maybeError.code, maybeError.message].filter(Boolean).join(" ").toLowerCase();
  return text.includes("already") || text.includes("duplicate") || text.includes("exists");
}

async function findProfileByAuthUserId(admin: SupabaseClient, authUserId: string, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .or(`auth_user_id.eq.${authUserId},id.eq.${authUserId}`)
      .limit(1)
      .maybeSingle();
    if (data) return data;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
}

export async function POST(request: NextRequest) {
  // 1. Identificar al llamante con el cliente anon+cookies (respeta su sesión)
  //    y validar que tenga el permiso staff.manage (admin lo tiene siempre).
  const callerSupabase = await createServerSupabaseClient();
  const {
    data: { user: callerUser },
  } = await callerSupabase.auth.getUser();

  if (!callerUser) {
    return jsonError(401, "not_authenticated", "Necesitás iniciar sesión.");
  }

  const { data: hasStaffManage, error: permError } = await callerSupabase.rpc("has_permission", {
    perm: "staff.manage",
  });

  if (permError || !hasStaffManage) {
    return jsonError(403, "forbidden", "No tenés permiso para dar de alta personal.");
  }

  // 2. Validar payload
  let payload: StaffPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "invalid_body", "Cuerpo de la solicitud inválido.");
  }

  const fullName = payload.fullName?.trim();
  const email = payload.email?.trim().toLowerCase();
  const role = payload.role;

  if (!fullName) return jsonError(400, "missing_full_name", "Falta el nombre completo.");
  if (!email) return jsonError(400, "missing_email", "Falta el email.");
  if (!isCreatableRole(role)) {
    return jsonError(400, "invalid_role", "El rol debe ser 'barbero' o 'gerente'.");
  }

  const { supabaseUrl, serviceRoleKey } = getAdminEnv();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(
      500,
      "service_role_missing",
      "Falta SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_URL) en el servidor."
    );
  }

  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. Crear el usuario de auth con password temporal
  const tempPassword = generateTempPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created?.user) {
    if (isDuplicateEmailError(createError)) {
      return jsonError(409, "email_taken", "Ya existe una cuenta con ese email.");
    }
    console.error("Error creando usuario de staff:", createError);
    return jsonError(500, "create_user_failed", "No se pudo crear el usuario.");
  }

  const authUserId = created.user.id;

  // 4. El trigger on_auth_user_created ya insertó una fila en profiles con
  //    role='cliente' — la actualizamos con el rol y los permisos reales.
  const permissions = sanitizePermissionOverrides(payload.permissionOverrides);

  const existingProfile = await findProfileByAuthUserId(admin, authUserId);
  let profileId: string;

  if (!existingProfile) {
    // Trigger no corrió a tiempo (raro) — insertamos manualmente.
    const { data: inserted, error: insertError } = await admin
      .from("profiles")
      .insert({ auth_user_id: authUserId, full_name: fullName, phone: payload.phone || null, role, permissions })
      .select("id")
      .maybeSingle();

    if (insertError || !inserted) {
      console.error("Error insertando perfil de staff:", insertError);
      return jsonError(500, "profile_insert_failed", "El usuario se creó pero no se pudo asignar el perfil.");
    }
    profileId = inserted.id;
  } else {
    const { error: updateError } = await admin
      .from("profiles")
      .update({ full_name: fullName, phone: payload.phone || null, role, permissions })
      .eq("id", existingProfile.id);

    if (updateError) {
      console.error("Error actualizando perfil de staff:", updateError);
      return jsonError(500, "profile_update_failed", "El usuario se creó pero no se pudo actualizar el perfil.");
    }
    profileId = existingProfile.id;
  }

  // 5. Si es barbero, además crear su fila en `barbers` para que aparezca
  //    en la agenda y en /admin/barberos.
  let barberId: string | null = null;
  if (role === "barbero") {
    const { data: barber, error: barberError } = await admin
      .from("barbers")
      .insert({
        profile_id: profileId,
        name: fullName,
        bio: payload.bio || null,
        avatar_url: payload.avatarUrl || null,
        branch_id: payload.branchId || null,
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (barberError) {
      console.error("Error creando fila de barbero:", barberError);
      return jsonError(
        500,
        "barber_insert_failed",
        "El usuario y el perfil se crearon, pero no se pudo crear la fila de barbero."
      );
    }
    barberId = barber?.id ?? null;
  }

  return NextResponse.json({
    ok: true,
    email,
    tempPassword,
    role,
    profileId,
    barberId,
  });
}
