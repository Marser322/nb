import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_CONFIG, ROUTES } from "@/lib/constants";
import { canCancelAppointment } from "@/lib/utils";
import { fetchAvailability, dayHasFreeSlot } from "@/lib/booking";
import {
  STATIC_SERVICES,
  STATIC_BARBERS,
  STATIC_PRODUCTS,
  STATIC_STYLES
} from "@/lib/static-data";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type AssistantServiceItem = {
  id: string | number;
  name: string;
  price: number;
  duration: number;
  desc: string;
};

type AssistantBranchItem = {
  id: string | number;
  name: string;
  address: string;
  phone: string;
  hours?: string;
};

type AssistantStyleItem = {
  id: string | number;
  name: string;
  serviceId: string;
  tags: string[];
};

type AssistantProductItem = {
  name: string;
  price: number;
  desc: string;
};

type AssistantData =
  | { type: "services"; items: AssistantServiceItem[] }
  | { type: "branches"; items: AssistantBranchItem[] }
  | { type: "styles"; items: AssistantStyleItem[] }
  | { type: "products"; items: AssistantProductItem[] }
  | { type: "action"; label: string; url: string };

type ChatService = {
  id: string | number;
  name: string;
  price: number;
  duration_minutes?: number;
  description?: string;
};

type ChatBarber = {
  id: string | number;
  name: string;
  bio?: string;
};

type ChatProduct = {
  name: string;
  price: number;
  description?: string;
};

type ChatLookbook = {
  id: string | number;
  title?: string;
  tags?: string[];
  serviceId?: string;
};

type ChatBranch = {
  id: string | number;
  name: string;
  address?: string;
  phone?: string;
  hours?: string;
};

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Convierte un array de días (0=Domingo..6=Sábado) a un label legible ("Lunes a Sábado"). */
function formatWorkingDaysLabel(days: readonly number[]): string {
  if (days.length === 0) return "Consultá disponibilidad";
  const sorted = [...days].sort((a, b) => a - b);
  const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isContiguous) {
    return sorted.length === 1
      ? DAY_NAMES[sorted[0]]
      : `${DAY_NAMES[sorted[0]]} a ${DAY_NAMES[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
}

/**
 * Copy de horarios derivado de BUSINESS_CONFIG (única fuente de verdad para el copy
 * de branding). La disponibilidad exacta en vivo sale del RPC get_availability.
 */
const businessHoursCopy = `${formatWorkingDaysLabel(BUSINESS_CONFIG.workingDays)}: ${String(
  BUSINESS_CONFIG.workingHours.start
).padStart(2, "0")}:00 - ${String(BUSINESS_CONFIG.workingHours.end).padStart(2, "0")}:00 (la disponibilidad exacta se confirma al reservar)`;

/**
 * Parsea la respuesta de texto del LLM: si viene como bloque JSON con "content"/"data"
 * (posiblemente envuelto en ```json), lo desestructura; si no, lo trata como texto plano.
 */
function parseAssistantText(text: string): { content: string; data: AssistantData | null } {
  try {
    const cleanJson = text.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return { content: parsed.content, data: parsed.data ?? null };
    }
  } catch {
    // Texto plano, no es JSON estructurado
  }
  return { content: text, data: null };
}

/**
 * Llama a un proveedor LLM (Gemini u OpenAI) con timeout de 10s y manejo de errores.
 * Devuelve el texto de la respuesta o null si el proveedor falló/no respondió a tiempo,
 * para que el caller pueda seguir con la cascada (nunca lanza).
 */
async function callLLM(
  provider: "gemini" | "openai",
  apiKey: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string | null> {
  try {
    if (provider === "gemini") {
      const geminiContents = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: geminiContents,
            systemInstruction: { parts: [{ text: systemPrompt }] }
          }),
          signal: AbortSignal.timeout(10000)
        }
      );

      if (!response.ok) return null;
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    }

    // OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages]
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.error(`Error calling ${provider} LLM provider:`, err);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = (body.messages || []) as ChatMessage[];
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage?.content?.toLowerCase() || "";
    const normalizedUserQuery = userQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    const isDemoAdminQuery = /\b(panel|admin|administracion|gestion|demo|crm)\b/.test(normalizedUserQuery);

    // Resolve mode / persona / context parameter
    let mode = (body.mode || body.persona || body.context || "client").toLowerCase();

    const supabase = await createClient();

    // Verify admin role if mode is admin
    if (mode === "admin") {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          mode = "client";
        } else {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("auth_user_id", user.id)
            .single();

          if (profileError || !profile || profile.role !== "admin") {
            mode = "client";
          }
        }
      } catch (authError) {
        console.error("Error verifying admin role, downgrading to client:", authError);
        mode = "client";
      }
    }

    // Sesión del cliente y su próxima cita (solo modo cliente; nunca rompe el chat si falla)
    let isLoggedIn = false;
    let nextAppointment: {
      date: string;
      startTime: string;
      serviceName: string;
      barberName: string;
      canCancel: boolean;
    } | null = null;

    if (mode !== "admin") {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          isLoggedIn = true;
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id")
            .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle();

          if (profileData?.id) {
            const todayStr = new Date().toISOString().slice(0, 10);
            const { data: appt } = await supabase
              .from("appointments")
              .select("appointment_date, start_time, service:services(name), barber:barbers(name)")
              .eq("client_id", profileData.id)
              .gte("appointment_date", todayStr)
              .in("status", ["pending", "confirmed"])
              .order("appointment_date", { ascending: true })
              .order("start_time", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (appt) {
              const service = Array.isArray(appt.service) ? appt.service[0] : appt.service;
              const barber = Array.isArray(appt.barber) ? appt.barber[0] : appt.barber;
              nextAppointment = {
                date: appt.appointment_date,
                startTime: appt.start_time,
                serviceName: service?.name || "tu servicio",
                barberName: barber?.name || "tu barbero",
                canCancel: canCancelAppointment(appt.appointment_date, appt.start_time),
              };
            }
          }
        }
      } catch (sessionError) {
        console.error("Error fetching user's next appointment for chat:", sessionError);
      }
    }

    // 1. Fetch live database values
    let dbServices: ChatService[] = [];
    let dbBarbers: ChatBarber[] = [];
    let dbProducts: ChatProduct[] = [];
    let dbLookbook: ChatLookbook[] = [];
    const dbFeatures: Record<string, boolean> = {};
    let dbBranches: ChatBranch[] = [];

    try {
      // Fetch active features
      const { data: settingsData } = await supabase
        .from("app_settings")
        .select("key, value")
        .like("key", "feature.%");

      if (settingsData) {
        settingsData.forEach((row) => {
          const featureName = row.key.replace("feature.", "");
          dbFeatures[featureName] = row.value === true || row.value === "true";
        });
      }

      // Fetch active services
      const { data: servicesData } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (servicesData && servicesData.length > 0) {
        dbServices = servicesData;
      }

      // Fetch active barbers
      const { data: barbersData } = await supabase
        .from("barbers")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (barbersData && barbersData.length > 0) {
        dbBarbers = barbersData;
      }

      // Fetch active products
      const { data: productsData } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (productsData && productsData.length > 0) {
        dbProducts = productsData;
      }

      // Fetch lookbook
      const { data: lookbookData } = await supabase
        .from("lookbook")
        .select("*")
        .order("created_at", { ascending: false });
      if (lookbookData && lookbookData.length > 0) {
        dbLookbook = lookbookData;
      }

      // Fetch active branches
      const { data: branchesData } = await supabase
        .from("branches")
        .select("id, name, address, phone")
        .eq("is_active", true);
      if (branchesData && branchesData.length > 0) {
        dbBranches = branchesData;
      }
    } catch (dbError) {
      console.error("Error querying database in chat API, falling back to static:", dbError);
    }

    // Apply fallbacks for empty query results
    const services = dbServices.length > 0 ? dbServices : STATIC_SERVICES;
    const barbers = dbBarbers.length > 0 ? dbBarbers : STATIC_BARBERS;
    const products = dbProducts.length > 0 ? dbProducts : STATIC_PRODUCTS;
    const lookbook = dbLookbook.length > 0 ? dbLookbook : STATIC_STYLES;

    const activeFeatures = {
      tienda: dbFeatures.tienda !== undefined ? dbFeatures.tienda : true,
      suscripciones: dbFeatures.suscripciones !== undefined ? dbFeatures.suscripciones : true,
      contabilidad: dbFeatures.contabilidad !== undefined ? dbFeatures.contabilidad : true,
      propinas: dbFeatures.propinas !== undefined ? dbFeatures.propinas : true,
      mensajes_crm: dbFeatures.mensajes_crm !== undefined ? dbFeatures.mensajes_crm : true,
      lookbook: dbFeatures.lookbook !== undefined ? dbFeatures.lookbook : true,
      reservas_online: dbFeatures.reservas_online !== undefined ? dbFeatures.reservas_online : true,
      portal_barbero: dbFeatures.portal_barbero !== undefined ? dbFeatures.portal_barbero : true,
    };

    // Static branches details matching BUSINESS_CONFIG
    const staticBranches: AssistantBranchItem[] = [
      { id: 1, name: "New Brothers Central", address: "Av. Principal 1234, Centro", phone: "099 123 456", hours: businessHoursCopy },
      { id: 2, name: "New Brothers Norte", address: "Shopping Norte, Local 5", phone: "098 765 432", hours: businessHoursCopy },
      { id: 3, name: "New Brothers Beach", address: "Rambla Costanera 500", phone: "091 112 233", hours: businessHoursCopy }
    ];

    const branches: AssistantBranchItem[] = dbBranches.length > 0
      ? dbBranches.map(b => ({
          id: b.id,
          name: b.name,
          address: b.address || "",
          phone: b.phone || "",
          hours: businessHoursCopy
        }))
      : staticBranches;

    // 1b. Disponibilidad real (context injection, no function calling): si la consulta
    // parece preguntar por turnos/horarios, resolvemos hasta 3 barberos activos contra
    // get_availability (hoy -> +3 días) y armamos un resumen compacto. Si el RPC falla,
    // simplemente se omite el bloque — nunca debe romper el chat.
    const wantsAvailability = mode !== "admin" &&
      /turno|hora|lugar|disponib|agenda|hoy|manana|libre/.test(normalizedUserQuery);
    let availabilitySummary: string | null = null;

    if (wantsAvailability) {
      try {
        const candidateBarbers = barbers.slice(0, 3);
        const todayISO = new Date().toISOString().slice(0, 10);
        const toDateObj = new Date();
        toDateObj.setDate(toDateObj.getDate() + 3);
        const toISO = toDateObj.toISOString().slice(0, 10);

        const results = await Promise.all(
          candidateBarbers.map(async (b) => {
            try {
              const days = await fetchAvailability(supabase, String(b.id), todayISO, toISO);
              return { barberName: b.name, days };
            } catch {
              return null;
            }
          })
        );

        const dayMap = new Map<string, { open: boolean; range: string | null; barbersWithSlot: string[] }>();
        for (const result of results) {
          if (!result) continue;
          for (const day of result.days) {
            const entry = dayMap.get(day.day) ?? { open: day.is_open, range: null, barbersWithSlot: [] };
            entry.open = entry.open || day.is_open;
            if (day.is_open && day.open_time && day.close_time) {
              entry.range = `${day.open_time.slice(0, 5)}-${day.close_time.slice(0, 5)}`;
            }
            if (day.is_open && dayHasFreeSlot(day, 30)) {
              entry.barbersWithSlot.push(result.barberName);
            }
            dayMap.set(day.day, entry);
          }
        }

        if (dayMap.size > 0) {
          availabilitySummary = Array.from(dayMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, info]) => {
              if (!info.open) return `${date}: cerrado`;
              if (info.barbersWithSlot.length === 0) return `${date}: sin huecos libres`;
              return `${date}${info.range ? ` (${info.range})` : ""}: hay lugar con ${info.barbersWithSlot.join(", ")}`;
            })
            .join("\n");
        }
      } catch (availabilityError) {
        console.error("Error building live availability summary for chat:", availabilityError);
      }
    }

    // 2. Select system prompt and instructions
    let systemPrompt = "";
    if (mode === "admin") {
      systemPrompt = `Eres el Asistente Experto en Gestión (coach experto del CRM) de la barbería "New Brothers" para el dueño o administrador del negocio.
Tus respuestas deben ser profesionales, analíticas, estructuradas y sumamente claras.
Tus objetivos principales son:
1. Explicar cómo usar cada sección del panel administrativo (CRM).
2. Responder dudas operativas sobre el sistema de caja, liquidaciones a barberos, gestión de citas, productos, etc.
3. Dar consejos y tips de administración comercial basados en la información y configuraciones activas.

MÓDULOS DEL CRM Y CÓMO USARLOS:
- Dashboard: Métricas de rendimiento, citas del día, nuevos clientes, alertas de stock bajo e inactividad.
- Citas (/admin/citas): Crear citas manuales ("Nueva Cita" para walk-ins), reprogramar citas, cancelar citas y gestionar el estado del día.
- Clientes (/admin/clientes): Perfiles de clientes, notas internas del cliente y registro de historial.
- Mensajes (/admin/mensajes): Visualizar y enviar recordatorios y notificaciones masivas de fidelización (e.g. WhatsApp).
- Productos (/admin/productos): Controlar el stock de insumos y productos de reventa, crear nuevos productos, ajustar precios y ver alertas de stock bajo.
- Caja (/admin/caja): Registrar movimientos manuales de ingresos y egresos (gastos del local), controlar métodos de pago y ver el total en caja.
- Liquidaciones (/admin/liquidaciones): Calcular y registrar pagos a los barberos según su modelo de compensación (comisión, renta fija, híbrido).
- Sucursales (/admin/sucursales): Gestionar los diferentes locales de New Brothers.
- Barberos (/admin/barberos): Crear, editar y desactivar barberos; configurar sus horarios de trabajo y sucursales.
- Servicios (/admin/servicios): Administrar el menú de servicios, precios y duración.
- Configuración (/admin/configuracion): Activar/desactivar módulos clave de la plataforma.

ESTADO DE MÓDULOS (Gating de Features):
- Reservas online: ${activeFeatures.reservas_online ? 'Módulo activo' : 'Módulo apagado'}
- Tienda e-commerce: ${activeFeatures.tienda ? 'Módulo activo' : 'Módulo apagado'}
- Caja y Liquidaciones (Contabilidad): ${activeFeatures.contabilidad ? 'Módulo activo' : 'Módulo apagado. Si te preguntan sobre caja o liquidaciones, indica que se debe activar desde la sección Configuración.'}
- Mensajes CRM (Fidelización): ${activeFeatures.mensajes_crm ? 'Módulo activo' : 'Módulo apagado. Si te preguntan sobre mensajes automáticos, indica que se debe activar desde la sección Configuración.'}
- Suscripciones (Turnos recurrentes): ${activeFeatures.suscripciones ? 'Módulo activo' : 'Módulo apagado'}
- Galería de estilos (Lookbook): ${activeFeatures.lookbook ? 'Módulo activo' : 'Módulo apagado'}

RESTRICCIONES IMPORTANTES:
- NO des instrucciones ni expliques flujos de módulos que estén APAGADOS. Informa de manera concisa que dicho módulo se encuentra inactivo y debe activarse en Configuración si es necesario.
- Responde siempre en español con terminología clara.`;
    } else {
      const demoAdminPrompt = isDemoMode
        ? `
DEMO PÚBLICA DEL PANEL ADMIN:
- Si el usuario pregunta por "panel", "admin", "gestión", "demo" o "CRM", explicá que puede entrar con el botón "Entrar como Admin demo" en /admin-login o desde el botón de ayuda flotante.
- No reveles contraseñas ni credenciales demo.`
        : "";

      const availabilityPrompt = availabilitySummary
        ? `

DISPONIBILIDAD PRÓXIMOS DÍAS (datos reales):
${availabilitySummary}`
        : "";

      const userAppointmentPrompt = nextAppointment
        ? `

CITA DEL USUARIO (datos reales, usuario con sesión iniciada):
- Próxima cita: ${nextAppointment.date} a las ${nextAppointment.startTime.slice(0, 5)}, servicio "${nextAppointment.serviceName}" con ${nextAppointment.barberName}.
- ${nextAppointment.canCancel ? "Todavía está dentro de la ventana para cancelar o reprogramar." : "Ya está fuera de la ventana para cancelar sin cargo."}
- Si el usuario pregunta por su turno, respondé con estos datos e incluí un action hacia Mi Cuenta (${ROUTES.MI_CUENTA}) para gestionarlo.`
        : isLoggedIn
          ? `

CITA DEL USUARIO: el usuario tiene sesión iniciada pero no tiene ninguna cita próxima agendada. Si pregunta por su turno, decíselo e invitalo a reservar.`
          : "";

      systemPrompt = `Eres el Asistente Virtual Inteligente (conserje amable) de la barbería premium "New Brothers" en Uruguay. 
Tus respuestas deben ser cálidas, educadas, atentas y serviciales, con una estética premium de lujo minimalista.
Tus objetivos principales son:
1. Responder las dudas del usuario con exactitud usando la información oficial de la barbería.
2. Ayudar a elegir servicios y recomendar estilos del Lookbook.
3. EMPUJAR al cliente a reservar su cita. Si el usuario muestra interés, invítalo amablemente a agendar su turno usando el link de reserva.
4. Si te preguntan por recomendaciones de cortes o estilos, sugiere uno de los estilos disponibles del Lookbook y menciónales que pueden reservarlo directamente.

INFORMACIÓN OFICIAL DE LA BARBERÍA:
- Servicios: ${JSON.stringify(services)}
- Barberos: ${JSON.stringify(barbers.map(b => ({ name: b.name, bio: b.bio })))}
- Sucursales: ${JSON.stringify(branches.map(b => ({ name: b.name, address: b.address, phone: b.phone, hours: b.hours })))}
- Productos en tienda: ${activeFeatures.tienda ? JSON.stringify(products.map(p => ({ name: p.name, price: p.price, desc: p.description || "" }))) : 'La tienda online está desactivada actualmente.'}
- Estilos (Lookbook): ${activeFeatures.lookbook ? JSON.stringify(lookbook.map(l => ({ id: l.id, name: l.title, tags: l.tags }))) : 'La galería de estilos está desactivada actualmente.'}
- Políticas y FAQ:
  * Cancelación de citas: Permitida hasta ${BUSINESS_CONFIG.cancellationWindow / 60} horas antes de la cita.
  * Medios de pago: Efectivo en el local, transferencia bancaria y pagos online vía MercadoPago o tarjetas.
  * Tolerancia: Agradecemos llegar 5-10 minutos antes. Pasados los 10 minutos de retraso, se puede tener que reprogramar.

RESTRICCIONES IMPORTANTES:
- Reservas online: ${activeFeatures.reservas_online ? 'ACTIVADAS. Debes empujar al usuario a reservar su turno y guiarlo a hacerlo.' : 'DESACTIVADAS por mantenimiento. Informa al usuario que la agenda online no está disponible temporalmente y no ofrezcas reservar.'}
- Tienda online: ${activeFeatures.tienda ? 'ACTIVADA.' : 'DESACTIVADA. No recomiendes productos ni menciones la tienda.'}
- Responde siempre en español. No inventes información que no esté en la lista oficial.${demoAdminPrompt}${availabilityPrompt}${userAppointmentPrompt}`;
    }

    // Add structured UI formats prompt instruction
    const structuredOutputInstruction = `
Puedes sugerir componentes interactivos en tus respuestas respondiendo con un objeto JSON válido que contenga las propiedades "content" (texto en markdown) y "data" (objeto opcional). Si decides no usar componentes interactivos, puedes responder con texto normal o en formato JSON con data=null.

Estructura JSON permitida en "data":
1. { "type": "services", "items": [{ "id": "uuid", "name": "...", "price": 0, "duration": 30, "desc": "..." }] }
2. { "type": "styles", "items": [{ "id": "uuid", "name": "...", "serviceId": "uuid", "tags": [] }] }
3. { "type": "products", "items": [{ "name": "...", "price": 0, "desc": "..." }] }
4. { "type": "action", "label": "Texto del botón", "url": "/ruta" }

Reglas para "action":
- Si el usuario muestra intención de reservar, SIEMPRE incluí un "action" hacia "${ROUTES.RESERVAR}" (o, si el servicio ya quedó claro en la conversación, hacia "${ROUTES.RESERVAR}?serviceId=<id>").
- Si el usuario pregunta por su propia cita/turno o cómo cancelarla/reprogramarla, SIEMPRE incluí un "action" hacia "${ROUTES.MI_CUENTA}" con label "Ver en Mi Cuenta".
`;

    // 3. Connect with LLM Providers if keys are present (cascada secuencial real:
    // Gemini -> si falla o no hay texto -> OpenAI -> si falla -> motor local)
    const geminiKey = process.env.GEMINI_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    const fullSystemPrompt = `${systemPrompt}\n${structuredOutputInstruction}`;

    let llmText: string | null = null;

    if (geminiKey) {
      llmText = await callLLM("gemini", geminiKey, fullSystemPrompt, messages);
    }
    if (!llmText && openAiKey) {
      llmText = await callLLM("openai", openAiKey, fullSystemPrompt, messages);
    }
    if (llmText) {
      const { content, data } = parseAssistantText(llmText);
      return NextResponse.json({ role: "assistant", content, data });
    }

    // 4. FALLBACK INTELIGENTE (Motor de Reglas Semántico Local)
    let reply = "";
    let dataPayload: AssistantData | null = null;

    if (mode === "admin") {
      // Admin Local Rules Fallback
      if (normalizedUserQuery.includes("hola") || normalizedUserQuery.includes("buenas") || normalizedUserQuery.includes("buen dia")) {
        reply = "¡Hola, Administrador! Soy tu Coach de Gestión de New Brothers. Estoy aquí para guiarte en el uso del CRM, resolver tus dudas operativas (caja, liquidaciones, stock, clientes) y ayudarte a optimizar el negocio. ¿En qué módulo puedo asistirte hoy?";
      }
      else if (normalizedUserQuery.includes("caja") || normalizedUserQuery.includes("cobr") || normalizedUserQuery.includes("ingreso") || normalizedUserQuery.includes("egreso") || normalizedUserQuery.includes("gasto")) {
        if (!activeFeatures.contabilidad) {
          reply = "El módulo de Caja y Contabilidad está desactivado en la configuración actual. Podés activarlo en la sección de **Configuración** del panel para registrar movimientos e ingresos.";
        } else {
          reply = "Para registrar cobros o flujos de efectivo:\n1. Dirigite a **Caja** en el menú lateral.\n2. Hacé clic en **Registrar Ingreso** para registrar un cobro o en **Registrar Egreso** para registrar gastos del local (insumos, luz, etc.).\n3. Las citas marcadas como completadas con cobro se registran automáticamente como ingresos de tipo 'servicio'.";
          dataPayload = {
            type: "action",
            label: "Ir a Caja del Día",
            url: ROUTES.ADMIN_CAJA
          };
        }
      }
      else if (normalizedUserQuery.includes("liquida") || normalizedUserQuery.includes("pago a barbero") || normalizedUserQuery.includes("comision")) {
        if (!activeFeatures.contabilidad) {
          reply = "El módulo de Contabilidad y Liquidaciones está desactivado actualmente. Activalo desde la sección de **Configuración**.";
        } else {
          reply = "Para realizar liquidaciones a los barberos:\n1. Ve a **Liquidaciones** en el menú lateral.\n2. Seleccioná el barbero y el período de fechas deseado.\n3. Hacé clic en **Calcular** para visualizar las comisiones acumuladas, propinas y deducir rentas de sillón configuradas.";
          dataPayload = {
            type: "action",
            label: "Ir a Liquidaciones",
            url: ROUTES.ADMIN_LIQUIDACIONES
          };
        }
      }
      else if (normalizedUserQuery.includes("cita") || normalizedUserQuery.includes("reserva") || normalizedUserQuery.includes("agend")) {
        reply = "En la sección de **Citas** podés visualizar la agenda del día. Para crear una cita manual (clientes walk-in), hacé clic en 'Nueva Cita', ingresá el nombre, teléfono, servicio, barbero y horario. Las citas online de clientes se reflejarán allí en tiempo real.";
        dataPayload = {
          type: "action",
          label: "Ver Citas del Día",
          url: ROUTES.ADMIN_CITAS
        };
      }
      else if (normalizedUserQuery.includes("tienda") || normalizedUserQuery.includes("producto") || normalizedUserQuery.includes("stock")) {
        if (!activeFeatures.tienda) {
          reply = "El módulo de Tienda e-commerce está desactivado. Podés reactivarlo desde la sección **Configuración**.";
        } else {
          reply = "En **Productos** podés controlar el stock de insumos y reventas. El dashboard te mostrará alertas si algún producto cae por debajo de su stock de seguridad. Podés editar el stock haciendo clic en el producto.";
          dataPayload = {
            type: "action",
            label: "Ir a Inventario de Productos",
            url: ROUTES.ADMIN_PRODUCTOS
          };
        }
      }
      else if (normalizedUserQuery.includes("cliente") || normalizedUserQuery.includes("fidel") || normalizedUserQuery.includes("historial")) {
        reply = "En la sección de **Clientes** podés ver la base de datos completa de clientes registrados y walk-ins. Haciendo clic en un cliente podés agregar notas internas sobre sus preferencias (por ejemplo, 'usa cera mate') para recordarlo en su próxima visita.";
        dataPayload = {
          type: "action",
          label: "Ver Clientes",
          url: ROUTES.ADMIN_CLIENTES
        };
      }
      else if (normalizedUserQuery.includes("configura") || normalizedUserQuery.includes("modulo") || normalizedUserQuery.includes("prender") || normalizedUserQuery.includes("apagar")) {
        reply = "En la sección de **Configuración** podés encender o apagar módulos de forma modular, como la tienda, el sistema de caja/liquidaciones, recordatorios de mensajes o el portal del barbero.";
        dataPayload = {
          type: "action",
          label: "Configuración de Módulos",
          url: ROUTES.ADMIN_CONFIGURACION
        };
      }
      else {
        reply = "Entendido. Como tu Coach de Gestión de **New Brothers**, te puedo asistir con la operativa del panel: cobro de citas, registro de movimientos en Caja, cálculo de Liquidaciones, control de stock en Productos, o personalización en Configuración. ¿Qué área querés optimizar?";
      }
    } else {
      // Client Local Rules Fallback (normalizedUserQuery en TODAS las ramas: sin tildes no rompe el match)
      if (normalizedUserQuery.includes("hola") || normalizedUserQuery.includes("buenas") || normalizedUserQuery.includes("buen dia") || normalizedUserQuery.includes("buena tarde")) {
        reply = "¡Hola! Bienvenido a **New Brothers**. Soy tu Asesor de Estética Masculina personal. ¿En qué te puedo ayudar hoy? Podés consultarme sobre nuestros servicios, reservar turnos, recomendaciones de cortes o conocer nuestros locales.";
      }
      else if (
        !normalizedUserQuery.includes("cancelar") &&
        !normalizedUserQuery.includes("reprogramar") &&
        (
          normalizedUserQuery.includes("mi cita") ||
          normalizedUserQuery.includes("mi turno") ||
          normalizedUserQuery.includes("mi reserva") ||
          normalizedUserQuery.includes("proxima cita") ||
          normalizedUserQuery.includes("proximo turno")
        )
      ) {
        if (!isLoggedIn) {
          reply = "Para consultar tu turno necesito que inicies sesión primero. Iniciá sesión y volvé a preguntarme.";
          dataPayload = { type: "action", label: "Iniciar sesión", url: ROUTES.LOGIN };
        } else if (nextAppointment) {
          reply = `Tu próxima cita es el **${nextAppointment.date}** a las **${nextAppointment.startTime.slice(0, 5)}**: **${nextAppointment.serviceName}** con **${nextAppointment.barberName}**.\n\n` +
            (nextAppointment.canCancel
              ? "Todavía estás a tiempo de cancelarla o reprogramarla desde Mi Cuenta."
              : `Ya pasó la ventana de ${BUSINESS_CONFIG.cancellationWindow / 60} horas para cancelar sin cargo.`);
          dataPayload = { type: "action", label: "Ver en Mi Cuenta", url: ROUTES.MI_CUENTA };
        } else {
          reply = "No encontré ninguna cita próxima agendada a tu nombre. ¿Querés reservar un turno ahora?";
          if (activeFeatures.reservas_online) {
            dataPayload = { type: "action", label: "Reservar Turno Ahora", url: ROUTES.RESERVAR };
          }
        }
      }
      else if (normalizedUserQuery.includes("precio") || normalizedUserQuery.includes("costo") || normalizedUserQuery.includes("cuanto sale") || normalizedUserQuery.includes("servicio") || normalizedUserQuery.includes("menu")) {
        reply = "En **New Brothers** ofrecemos servicios de cuidado premium adaptados a tu estilo:\n\n" +
          services.map(s => `• **${s.name}**: $${s.price} | Duración: ${s.duration_minutes || 30} min\n  _${s.description || ""}_`).join("\n") +
          (activeFeatures.reservas_online ? "\n\n¿Te gustaría agendar alguno de estos servicios hoy?" : "");

        dataPayload = {
          type: "services",
          items: services.map(s => ({
            id: s.id,
            name: s.name,
            price: s.price,
            duration: s.duration_minutes || 30,
            desc: s.description || ""
          }))
        };
      }
      else if (
        !normalizedUserQuery.includes("cancelar") &&
        !normalizedUserQuery.includes("reprogramar") &&
        (wantsAvailability || normalizedUserQuery.includes("reserva") || normalizedUserQuery.includes("turno") || normalizedUserQuery.includes("agendar") || normalizedUserQuery.includes("cita") || normalizedUserQuery.includes("hora"))
      ) {
        if (!activeFeatures.reservas_online) {
          reply = "Disculpanos. El sistema de reservas online está desactivado temporalmente por mantenimiento. Por favor, volvé a intentar más tarde o comunicate al local.";
        } else {
          reply = availabilitySummary
            ? `Esto es lo que encontré para los próximos días:\n\n${availabilitySummary}\n\nHacé clic abajo para elegir tu horario exacto.`
            : "Para agendar tu turno de forma rápida, podés hacer clic en el botón de abajo o visitar nuestra sección de reservas. Podrás elegir tu sucursal más cercana, tu barbero preferido y el horario de tu conveniencia.";
          dataPayload = {
            type: "action",
            label: "Reservar Turno Ahora",
            url: ROUTES.RESERVAR
          };
        }
      }
      else if (normalizedUserQuery.includes("donde") || normalizedUserQuery.includes("sucursal") || normalizedUserQuery.includes("direccion") || normalizedUserQuery.includes("local") || normalizedUserQuery.includes("ubicacion")) {
        reply = "Contamos con tres sucursales premium en Uruguay:\n\n" +
          branches.map(b => `📍 **${b.name}**\n  Dirección: ${b.address}\n  Teléfono: ${b.phone}\n  Horario: ${b.hours}`).join("\n\n");
        dataPayload = {
          type: "branches",
          items: branches
        };
      }
      else if (normalizedUserQuery.includes("barbero") || normalizedUserQuery.includes("cortar") || normalizedUserQuery.includes("quien") || normalizedUserQuery.includes("equipo") || normalizedUserQuery.includes("personal")) {
        reply = "Contamos con un equipo de profesionales altamente calificados listos para atenderte:\n\n" +
          barbers.map(b => `• **${b.name}**: ${b.bio || "Barbero profesional especialista en estética masculina."}`).join("\n") +
          (activeFeatures.reservas_online ? "\n\nPodés elegir a cualquiera de ellos al agendar tu turno." : "");
      }
      else if (normalizedUserQuery.includes("recomienda") || normalizedUserQuery.includes("corte") || normalizedUserQuery.includes("estilo") || normalizedUserQuery.includes("look") || normalizedUserQuery.includes("peinado") || normalizedUserQuery.includes("lookbook")) {
        if (!activeFeatures.lookbook) {
          reply = "Actualmente la galería de estilos está en mantenimiento, pero te recomendamos nuestro Corte Clásico o Fade Degradado Alto.";
        } else {
          const stylesToSuggest = lookbook.slice(0, 4);
          reply = "¡Excelente! Basado en las tendencias actuales de estética masculina, te recomiendo revisar estos estilos de nuestro Lookbook. Podés hacer clic en cualquiera de ellos para agendar tu reserva con esa referencia visual:\n\n" +
            stylesToSuggest.map(s => `✂️ **${s.title}** (Ideal para tu próxima reserva)`).join("\n");
          dataPayload = {
            type: "styles",
            items: stylesToSuggest.map(s => ({
              id: s.id,
              name: s.title || "",
              serviceId: s.serviceId || "service-1",
              tags: s.tags || []
            }))
          };
        }
      }
      else if (normalizedUserQuery.includes("producto") || normalizedUserQuery.includes("cera") || normalizedUserQuery.includes("aceite") || normalizedUserQuery.includes("shampoo") || normalizedUserQuery.includes("tienda") || normalizedUserQuery.includes("venta")) {
        if (!activeFeatures.tienda) {
          reply = "La tienda de productos está desactivada temporalmente. ¡Pronto estará disponible de nuevo!";
        } else {
          const productsToSuggest = products.slice(0, 3);
          reply = "Cuidamos tu cabello y barba también en casa. Aquí tenés algunos de nuestros productos premium disponibles en nuestra tienda:\n\n" +
            productsToSuggest.map(p => `🧴 **${p.name}** ($${p.price})\n  _${p.description || ""}_`).join("\n\n") +
            "\n\nPodés adquirirlos online y retirarlos en tu sucursal de preferencia.";
          dataPayload = {
            type: "products",
            items: productsToSuggest.map(p => ({
              name: p.name,
              price: p.price,
              desc: p.description || ""
            }))
          };
        }
      }
      else if (
        normalizedUserQuery.includes("cancelar") ||
        normalizedUserQuery.includes("reprogramar") ||
        normalizedUserQuery.includes("politica") ||
        normalizedUserQuery.includes("tolerancia") ||
        normalizedUserQuery.includes("demoro") ||
        normalizedUserQuery.includes("demoras") ||
        normalizedUserQuery.includes("demora") ||
        normalizedUserQuery.includes("demorar") ||
        normalizedUserQuery.includes("retraso") ||
        normalizedUserQuery.includes("llego tarde")
      ) {
        reply = `**Políticas de Cancelación:** Podés cancelar o modificar tu turno de forma gratuita hasta ${BUSINESS_CONFIG.cancellationWindow / 60} horas antes de la cita acordada a través de la sección Mi Cuenta.\n\n**Tolerancia de Retraso:** Agradecemos llegar 5 o 10 minutos antes. Si te demorás más de 10 minutos, es posible que debamos reprogramar el turno para no retrasar a los demás clientes.`;
        dataPayload = { type: "action", label: "Gestionar mi turno", url: ROUTES.MI_CUENTA };
      }
      else if (
        normalizedUserQuery.includes("contacto") ||
        normalizedUserQuery.includes("telefono") ||
        normalizedUserQuery.includes("whatsapp") ||
        normalizedUserQuery.includes("llamar") ||
        normalizedUserQuery.includes("como llego") ||
        normalizedUserQuery.includes("como llegar")
      ) {
        reply = "Podés comunicarte con nosotros por teléfono, WhatsApp o visitando cualquiera de nuestras sucursales:\n\n" +
          branches.map(b => `📍 **${b.name}**\n  ${b.address}\n  📞 ${b.phone}`).join("\n\n");
        dataPayload = { type: "action", label: "Ver página de Contacto", url: ROUTES.CONTACTO };
      }
      else if (normalizedUserQuery.includes("pago") || normalizedUserQuery.includes("tarjeta") || normalizedUserQuery.includes("mercado") || normalizedUserQuery.includes("efectivo")) {
        reply = `**Medios de Pago:** Aceptamos efectivo en el local, transferencias bancarias y pagos online vía MercadoPago o tarjetas.`;
      }
      else if (isDemoMode && isDemoAdminQuery) {
        reply = "Sí, esta demo también tiene un panel de administración para recorrer el CRM de **New Brothers**. Podés entrar con el botón **Entrar como Admin demo** en `/admin-login` o abrirlo desde el botón de ayuda flotante. Por seguridad, no comparto contraseñas por el chat.";
        dataPayload = {
          type: "action",
          label: "Entrar como Admin demo",
          url: ROUTES.ADMIN_LOGIN
        };
      }
      else {
        reply = "Entiendo. En **New Brothers** nos enfocamos en brindarte la mejor experiencia de barbería. Si tenés dudas específicas sobre cómo reservar, precios de cortes, ubicaciones de nuestros locales o querés recomendaciones de estilos, ¡preguntame con confianza!";
      }
    }

    return NextResponse.json({
      role: "assistant",
      content: reply,
      data: dataPayload
    });
  } catch (error: unknown) {
    console.error("Error in chat API handler:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
