import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    // Si no hay credenciales de Supabase, permitir navegación sin autenticación
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
        console.warn('⚠️ Supabase no configurado. Ejecutá /db-setup y configurá .env.local')
        return supabaseResponse
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // IMPORTANTE: Evitar escribir lógica entre createServerClient y supabase.auth.getUser()
    // Un simple error puede hacer que la sesión del usuario sea difícil de depurar.
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Rutas protegidas
    // TODO: Descomentar para producción
    const protectedRoutes = ['/mi-cuenta'] // Admin y barbero temporalmente sin protección para demo
    // const protectedRoutes = ['/admin', '/barbero', '/mi-cuenta']
    const isProtectedRoute = protectedRoutes.some(route =>
        request.nextUrl.pathname.startsWith(route)
    )

    if (isProtectedRoute && !user) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
