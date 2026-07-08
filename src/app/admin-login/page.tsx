"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Lock, ArrowRight, Loader2, Mail, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode, useDemoAdminLogin } from "@/hooks/useDemoAdminLogin";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();
    const { loginAsDemoAdmin, isDemoLoading } = useDemoAdminLogin();

    useEffect(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            if (params.get("error") === "forbidden") {
                toast.error("No tenés permisos de administrador");
            }
        }
    }, []);

    const loginWithCredentials = async (loginEmail: string, loginPassword: string) => {
        const { data: { user }, error } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password: loginPassword
        });

        if (error || !user) {
            toast.error("Credenciales inválidas");
            return false;
        }

        // Consultar el rol del perfil
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle();

        if (profile?.role !== 'admin') {
            await supabase.auth.signOut();
            toast.error("No tenés permisos de administrador");
            return false;
        }

        toast.success("Bienvenido Administrador");
        router.push(ROUTES.ADMIN_DASHBOARD);
        router.refresh();
        return true;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            await loginWithCredentials(email, password);
        } catch {
            toast.error("Ocurrió un error al intentar iniciar sesión");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[url('/images/hero/herramientas-barberia.jpg')] bg-cover bg-center opacity-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-background/50" />

            <Card className="w-full max-w-md mx-4 relative z-10 border-amber-500/20 bg-card/50 backdrop-blur-xl shadow-2xl">
                <CardHeader className="space-y-1 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 relative rounded-full overflow-hidden border-2 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                        <Image
                            src="/logo.png"
                            alt="NB Barber"
                            fill
                            sizes="80px"
                            className="object-cover"
                        />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Acceso Administrativo</CardTitle>
                    <CardDescription>
                        Recorré el panel de gestión o ingresá con credenciales de administrador
                    </CardDescription>
                </CardHeader>
                {isDemoMode && (
                    <div className="mx-6 mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-lg shadow-amber-500/10 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-amber-500/20 p-2 text-amber-500">
                                <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Demo lista para presentar</p>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                    Entrá directo al CRM de New Brothers: agenda, clientes, caja, productos y reportes.
                                </p>
                            </div>
                        </div>
                        <Button
                            type="button"
                            className="h-12 w-full rounded-full bg-amber-500 font-semibold text-black shadow-lg shadow-amber-500/20 hover:bg-amber-400"
                            disabled={isDemoLoading}
                            onClick={loginAsDemoAdmin}
                        >
                            {isDemoLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Entrando al panel...
                                </>
                            ) : (
                                <>
                                    Entrar al panel administrativo
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </div>
                )}
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        {isDemoMode && (
                            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                <span className="h-px flex-1 bg-border" />
                                Acceso manual
                                <span className="h-px flex-1 bg-border" />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="admin@nbbarber.com"
                                    className="pl-9 bg-background/50 border-input/50 focus:border-amber-500/50 transition-colors"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    className="pl-9 pr-9 bg-background/50 border-input/50 focus:border-amber-500/50 transition-colors"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoFocus
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-10 w-10 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-11"
                            disabled={isLoading || isDemoLoading || !password || !email}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Verificando...
                                </>
                            ) : (
                                <>
                                    Ingresar al Panel
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
