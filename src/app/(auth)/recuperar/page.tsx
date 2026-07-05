"use client";

import { useState } from "react";
import Link from "next/link";
import { Scissors, Mail, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";

export default function RecuperarPage() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const supabase = createClient();

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email) {
            toast.error("Ingresá tu correo electrónico");
            return;
        }

        setIsLoading(true);

        const siteUrl = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || "https://nbbarber.vercel.app");

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${siteUrl}/actualizar-password`,
        });

        setIsLoading(false);

        if (error) {
            toast.error("Error al enviar el correo de recuperación");
            console.error(error);
            return;
        }

        toast.success("Si el email existe, te enviamos un enlace de recuperación");
        setEmail("");
    };

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="text-center">
                <Link href="/" className="flex items-center justify-center gap-2 mb-4">
                    <Scissors className="h-8 w-8 text-primary" />
                    <span className="text-2xl font-bold">
                        NB <span className="text-primary">Barber</span>
                    </span>
                </Link>
                <CardTitle className="text-2xl">Recuperar Contraseña</CardTitle>
                <CardDescription>
                    Te enviaremos un correo con un enlace para restablecer tu contraseña
                </CardDescription>
            </CardHeader>

            <form onSubmit={handleResetPassword}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="pl-10"
                                disabled={isLoading}
                                required
                            />
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-4">
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Enviando enlace...
                            </>
                        ) : (
                            <>
                                Enviar Enlace
                            </>
                        )}
                    </Button>

                    <Link
                        href={ROUTES.LOGIN}
                        className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver al inicio de sesión
                    </Link>
                </CardFooter>
            </form>
        </Card>
    );
}
