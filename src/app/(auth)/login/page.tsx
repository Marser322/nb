"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Scissors, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function LoginPageContent() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const nextParam = searchParams.get("next");
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error("Completá todos los campos");
            return;
        }

        setIsLoading(true);

        const { data: { user }, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error || !user) {
            if (error?.message.includes("Invalid login credentials")) {
                toast.error("Email o contraseña incorrectos");
            } else {
                toast.error("Error al iniciar sesión");
            }
            setIsLoading(false);
            return;
        }

        toast.success("¡Bienvenido de nuevo!");

        // Validar que el parámetro next empiece con '/' para evitar open redirect
        if (nextParam && nextParam.startsWith("/")) {
            router.push(nextParam);
            router.refresh();
            return;
        }

        // Sin next param: redirigir según el rol del perfil
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle();

        if (profile?.role === 'admin') {
            router.push(ROUTES.ADMIN_DASHBOARD);
        } else if (profile?.role === 'barbero') {
            router.push(ROUTES.BARBERO_AGENDA);
        } else {
            router.push(ROUTES.HOME);
        }
        router.refresh();
    };

    const handleDemoLogin = async () => {
        const demoEmail = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL;
        const demoPassword = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD;
        if (!demoEmail || !demoPassword) {
            toast.error("Credenciales demo no configuradas");
            return;
        }
        setEmail(demoEmail);
        setPassword(demoPassword);
        setIsLoading(true);

        const { data: { user }, error } = await supabase.auth.signInWithPassword({
            email: demoEmail,
            password: demoPassword,
        });

        if (error || !user) {
            toast.error("No se pudo iniciar la demo (¿el usuario demo existe en Supabase?)");
            setIsLoading(false);
            return;
        }

        toast.success("¡Bienvenido, Admin demo!");
        router.push(ROUTES.ADMIN_DASHBOARD);
        router.refresh();
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
                <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
                <CardDescription>
                    Ingresá a tu cuenta para reservar turnos
                </CardDescription>
            </CardHeader>

            <form onSubmit={handleLogin}>
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
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password">Contraseña</Label>
                            <Link href="/recuperar" className="text-xs text-primary hover:underline">
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>
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
                            />
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-4">
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Ingresando...
                            </>
                        ) : (
                            <>
                                Ingresar
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                        )}
                    </Button>

                    <p className="text-sm text-muted-foreground text-center">
                        ¿No tenés cuenta?{" "}
                        <Link href={ROUTES.REGISTER} className="text-primary hover:underline">
                            Registrate
                        </Link>
                    </p>

                    {isDemoMode && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-muted-foreground hover:text-primary"
                            disabled={isLoading}
                            onClick={handleDemoLogin}
                        >
                            ¿Querés ver el panel de administración? Entrá como admin demo
                        </Button>
                    )}
                </CardFooter>
            </form>
        </Card>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <Card className="border-border/50 bg-card/50 backdrop-blur">
                <CardContent className="p-8 flex items-center justify-center text-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                    Cargando...
                </CardContent>
            </Card>
        }>
            <LoginPageContent />
        </Suspense>
    );
}

