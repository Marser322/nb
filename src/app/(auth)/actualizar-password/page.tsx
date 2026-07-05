"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Scissors, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";

export default function ActualizarPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

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
            toast.error("Error al actualizar la contraseña: " + error.message);
            console.error(error);
            return;
        }

        toast.success("Contraseña actualizada con éxito. Iniciá sesión con tu nueva contraseña.");
        router.push(ROUTES.LOGIN);
    };

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
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pl-10"
                                disabled={isLoading}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="pl-10"
                                disabled={isLoading}
                                required
                            />
                        </div>
                    </div>
                </CardContent>

                <CardFooter>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Actualizando...
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
