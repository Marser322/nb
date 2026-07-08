// RBAC de NB Barber: separa ROL (grueso) de CAPACIDADES (finas).
// Espejo en TS de la lógica SQL de `has_permission()` (ver
// supabase/migrations/020_rbac_permisos.sql) — se usa acá SOLO para gating
// de UI (mostrar/ocultar botones y links). La seguridad real vive en RLS.
//
// Módulo plano sin dependencias de React: lo importan tanto componentes
// cliente (vía el hook usePermissions en src/lib/usePermissions.ts) como
// rutas server (p. ej. src/app/api/admin/staff/route.ts) para compartir las
// mismas claves/tipos de permiso.
import type { UserRole } from "@/types/database.types";

export type Permission =
    | "panel.access"
    | "agenda.own"
    | "agenda.all"
    | "finances.view"
    | "finances.manage"
    | "cash.operate"
    | "products.manage"
    | "services.manage"
    | "clients.view"
    | "clients.manage"
    | "staff.manage"
    | "branches.manage"
    | "reports.view"
    | "settings.manage";

export const ALL_PERMISSIONS: Permission[] = [
    "panel.access",
    "agenda.own",
    "agenda.all",
    "finances.view",
    "finances.manage",
    "cash.operate",
    "products.manage",
    "services.manage",
    "clients.view",
    "clients.manage",
    "staff.manage",
    "branches.manage",
    "reports.view",
    "settings.manage",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
    "panel.access": "Acceso al panel",
    "agenda.own": "Ver su propia agenda",
    "agenda.all": "Ver y operar todas las agendas",
    "finances.view": "Ver ganancias y liquidaciones",
    "finances.manage": "Gestionar compensación y liquidaciones",
    "cash.operate": "Operar caja (cobros, cierre)",
    "products.manage": "Gestionar productos",
    "services.manage": "Gestionar servicios",
    "clients.view": "Ver clientes",
    "clients.manage": "Gestionar clientes (notas, historial)",
    "staff.manage": "Gestionar equipo (altas, roles, permisos)",
    "branches.manage": "Gestionar sucursales",
    "reports.view": "Ver reportes",
    "settings.manage": "Gestionar configuración del sistema",
};

/**
 * Defaults por rol — debe coincidir con el seed de `role_permissions` en
 * supabase/migrations/020_rbac_permisos.sql. `admin` no se usa en la
 * práctica (siempre pasa por el atajo en `can()`), pero se deja completo
 * para que la UI de checkboxes pueda mostrarlo "todo tildado".
 *
 * Nota: `barbero` NO incluye `panel.access` a propósito, aunque el brief lo
 * menciona como "acceso a su portal" — su portal real es /barbero/mi-agenda,
 * gateado por rol (no por este permiso). Si `panel.access` default para
 * barbero, cualquier barbero entraría a /admin/*, que no es la intención.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
    cliente: [],
    barbero: ["agenda.own", "clients.view", "cash.operate"],
    gerente: [
        "panel.access",
        "agenda.all",
        "cash.operate",
        "products.manage",
        "services.manage",
        "clients.manage",
        "reports.view",
    ],
    admin: [...ALL_PERMISSIONS],
};

export interface PermissionProfile {
    role: UserRole;
    permissions?: Record<string, boolean> | null;
}

/**
 * ¿La persona tiene el permiso `perm`? Replica has_permission() de la DB:
 * admin ⇒ true; override explícito en `profile.permissions` manda; si no,
 * default del rol. Además, un permiso "*.manage" implica su "*.view"
 * hermano (igual que en las policies RLS de finances/clients).
 */
export function can(
    profile: PermissionProfile | null | undefined,
    perm: Permission
): boolean {
    if (!profile) return false;
    if (profile.role === "admin") return true;

    const resolve = (key: string): boolean => {
        const overrides = profile.permissions;
        if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
            return Boolean(overrides[key]);
        }
        return (ROLE_DEFAULT_PERMISSIONS[profile.role] ?? []).includes(
            key as Permission
        );
    };

    if (resolve(perm)) return true;

    if (perm.endsWith(".view")) {
        const managePerm = perm.replace(".view", ".manage");
        if (resolve(managePerm)) return true;
    }

    return false;
}
