import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Iniciar Supabase Client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 2. Obtener Configuración Activa
        const { data: config, error: configError } = await supabaseClient
            .from('reminders_config')
            .select('*')
            .eq('is_active', true)
            .single()

        if (configError || !config) {
            return new Response(
                JSON.stringify({ message: 'No active reminder configuration found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const DAYS_LIMIT = config.days_since_last_visit

        // Calcular fecha límite (Hoy - X días)
        const limitDate = new Date()
        limitDate.setDate(limitDate.getDate() - DAYS_LIMIT)
        const limitDateStr = limitDate.toISOString().split('T')[0] // YYYY-MM-DD

        // 3. Buscar Clientes Inactivos
        // Estrategia: Obtener todas las citas completadas, agrupar por teléfono en memoria (para simplificar query),
        // y verificar su última fecha.
        // NOTA: En una DB grande esto debería ser SQL puro con GROUP BY y HAVING.

        const { data: appointments, error: appError } = await supabaseClient
            .from('appointments')
            .select('client_name, client_phone, appointment_date, status')
            .in('status', ['completed', 'confirmed', 'pending'])

        if (appError) throw appError

        // Procesar datos
        const clientHistory = {}

        // a. Encontrar la última fecha de visita por cliente
        appointments.forEach(app => {
            if (!app.client_phone) return

            const phone = app.client_phone
            const date = new Date(app.appointment_date)

            if (!clientHistory[phone]) {
                clientHistory[phone] = {
                    name: app.client_name,
                    lastVisit: null,
                    hasFutureBooking: false
                }
            }

            if (app.status === 'completed') {
                if (!clientHistory[phone].lastVisit || date > clientHistory[phone].lastVisit) {
                    clientHistory[phone].lastVisit = date
                }
            } else if (['confirmed', 'pending'].includes(app.status)) {
                // Si tiene fecha futura, marcar flag
                if (date >= new Date()) {
                    clientHistory[phone].hasFutureBooking = true
                }
            }
        })

        // b. Filtrar candidatos
        const clientsToRemind = []
        const now = new Date()

        for (const [phone, data] of Object.entries(clientHistory)) {
            if (!data.lastVisit) continue // Nunca completó una cita
            if (data.hasFutureBooking) continue // Ya tiene reserva

            // Calcular días desde última visita
            const diffTime = Math.abs(now.getTime() - data.lastVisit.getTime())
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

            if (diffDays >= DAYS_LIMIT) {
                clientsToRemind.push({
                    phone,
                    name: data.name,
                    daysSince: diffDays
                })
            }
        }

        // 4. Enviar Mensajes (Simulación) y Loguear
        const logs = []

        for (const client of clientsToRemind) {
            // Verificar si ya se le envió mensaje recientemente (ej: en los últimos 7 días)
            // Para evitar spam diario.
            // (Omitido por simplicidad en esta versión v1, pero recomendable)

            const message = config.message_template.replace('{nombre}', client.name || 'Cliente')

            // AQUÍ IRÍA LA LLAMADA A WHATSAPP API (Twilio/Meta)
            // await sendWhatsApp(client.phone, message)

            // Loguear intento
            const { error: logError } = await supabaseClient
                .from('communication_logs')
                .insert({
                    client_name: client.name,
                    client_phone: client.phone,
                    message_sent: message,
                    status: 'sent', // Simulado
                    metadata: { days_inactive: client.daysSince }
                })

            if (!logError) {
                logs.push({ phone: client.phone, status: 'sent' })
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                candidates_found: clientsToRemind.length,
                messages_sent: logs.length,
                processed_clients: logs
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
