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
        console.warn('Supabase no configurado. Ejecutá /db-setup y configurá .env.local')
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

    const pathname = request.nextUrl.pathname

    // 1. Ruta /admin y subrutas (excluyendo /admin-login)
    if ((pathname.startsWith('/admin/') || pathname === '/admin') && pathname !== '/admin-login') {
        if (!user) {
            const url = request.nextUrl.clone()
            url.pathname = '/admin-login'
            return NextResponse.redirect(url)
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle()

        if (profile?.role !== 'admin') {
            const url = request.nextUrl.clone()
            url.pathname = '/admin-login'
            url.searchParams.set('error', 'forbidden')
            return NextResponse.redirect(url)
        }
    }

    // 2. Ruta /barbero y subrutas
    if (pathname.startsWith('/barbero/') || pathname === '/barbero') {
        if (!user) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            return NextResponse.redirect(url)
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle()

        if (profile?.role !== 'barbero' && profile?.role !== 'admin') {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            return NextResponse.redirect(url)
        }
    }

    // 3. Ruta /mi-cuenta
    if (pathname.startsWith('/mi-cuenta') || pathname === '/mi-cuenta') {
        if (!user) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            return NextResponse.redirect(url)
        }
    }

    return supabaseResponse
}
