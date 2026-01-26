"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants";

export async function loginAdmin(formData: FormData) {
    const password = formData.get("password") as string;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        console.error("ADMIN_PASSWORD is not set in environment variables");
        return { success: false, message: "Error de configuración del servidor" };
    }

    if (password === adminPassword) {
        const cookieStore = await cookies();
        cookieStore.set("admin_session", "true", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 60 * 60 * 24, // 24 hours
            path: "/",
        });

        return { success: true };
    } else {
        return { success: false, message: "Contraseña incorrecta" };
    }
}
