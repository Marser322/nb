"use client";

import { loginAdmin } from "./actions";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Lock, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";

export default function AdminLoginPage() {
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData();
        formData.append("password", password);

        try {
            const result = await loginAdmin(formData);

            if (result.success) {
                toast.success("Bienvenido Administrador");
                router.push(ROUTES.ADMIN_DASHBOARD);
            } else {
                toast.error(result.message);
                setIsLoading(false);
            }
        } catch (error) {
            toast.error("Ocurrió un error al intentar iniciar sesión");
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=2070')] bg-cover bg-center opacity-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-background/50" />

            <Card className="w-full max-w-md mx-4 relative z-10 border-amber-500/20 bg-card/50 backdrop-blur-xl shadow-2xl">
                <CardHeader className="space-y-1 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 relative rounded-full overflow-hidden border-2 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                        <Image
                            src="/logo.png"
                            alt="Logo"
                            fill
                            className="object-cover"
                        />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Acceso Administrativo</CardTitle>
                    <CardDescription>
                        Ingresá la contraseña maestra para continuar
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
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
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-11"
                            disabled={isLoading || !password}
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
