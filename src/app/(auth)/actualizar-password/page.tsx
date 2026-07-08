"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Scissors, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";

export default function ActualizarPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [hasValidSession, setHasValidSession] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    // Si alguien abre esta página sin venir del link de recuperación, no hay sesión
    // y updateUser fallaría con un mensaje crudo de Supabase. Se detecta al montar
    // (guard DESPUÉS de los hooks, más abajo) y se muestra un estado claro.
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setHasValidSession(Boolean(session));
            setIsCheckingSession(false);
        });
    }, [supabase]);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!password || !confirmPassword) {
            toast.error("Completá todos los campos");
            return;
        }

        if (password.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres");
            return;
        }

        if (password !== confirmPassword) {
            toast.error("Las contraseñas no coinciden");
            return;
        }

        setIsLoading(true);

        const { error } = await supabase.auth.updateUser({
            password: password,
        });

        setIsLoading(false);

        if (error) {
            toast.error("No pudimos actualizar tu contraseña. Probá pedir un nuevo enlace de recuperación.");
            console.error(error);
            return;
        }

        toast.success("Contraseña actualizada con éxito. Iniciá sesión con tu nueva contraseña.");
        router.push(ROUTES.LOGIN);
    };

    // Guard de sesión: va después de todos los hooks. Sin sesión (link vencido o
    // acceso directo sin pasar por /recuperar), se muestra un estado claro en vez
    // del form, con salida a pedir un enlace nuevo.
    if (!isCheckingSession && !hasValidSession) {
        return (
            <Card className="border-border/50 bg-card/50 backdrop-blur">
                <CardHeader className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <Scissors className="h-8 w-8 text-primary" />
                        <span className="text-2xl font-bold">
                            NB <span className="text-primary">Barber</span>
                        </span>
                    </div>
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <CardTitle className="text-2xl">Enlace no válido</CardTitle>
                    <CardDescription>
                        El enlace de recuperación expiró o no es válido. Pedí uno nuevo para poder cambiar tu contraseña.
                    </CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button asChild className="w-full">
                        <Link href="/recuperar">Pedir un enlace nuevo</Link>
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                    <Scissors className="h-8 w-8 text-primary" />
                    <span className="text-2xl font-bold">
                        NB <span className="text-primary">Barber</span>
                    </span>
                </div>
                <CardTitle className="text-2xl">Nueva Contraseña</CardTitle>
                <CardDescription>
                    Ingresá y confirmá tu nueva contraseña
                </CardDescription>
            </CardHeader>

            <form onSubmit={handleUpdatePassword}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">Nueva Contraseña</Label>
                        <PasswordInput
                            id="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading || isCheckingSession}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                        <PasswordInput
                            id="confirmPassword"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            disabled={isLoading || isCheckingSession}
                            required
                        />
                    </div>
                </CardContent>

                <CardFooter>
                    <Button type="submit" className="w-full" disabled={isLoading || isCheckingSession}>
                        {isLoading || isCheckingSession ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {isCheckingSession ? "Verificando..." : "Actualizando..."}
                            </>
                        ) : (
                            <>
                                Actualizar Contraseña
                            </>
                        )}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
