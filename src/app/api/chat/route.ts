import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

// Base de conocimiento estática de NewBrothers
const KNOWLEDGE_BASE = {
  salonName: "New Brothers | Salón de Estética Masculina",
  branches: [
    { id: 1, name: "New Brothers Central", address: "Av. Principal 1234, Centro", phone: "099 123 456", hours: "Lunes a Viernes: 09:00 - 20:00, Sábados: 09:00 - 18:00" },
    { id: 2, name: "New Brothers Norte", address: "Shopping Norte, Local 5", phone: "098 765 432", hours: "Lunes a Viernes: 09:00 - 20:00, Sábados: 09:00 - 18:00" },
    { id: 3, name: "New Brothers Beach", address: "Rambla Costanera 500", phone: "091 112 233", hours: "Lunes a Viernes: 10:00 - 21:00, Sábados: 09:00 - 19:00" }
  ],
  services: [
    { id: "1", name: "Corte Clásico", price: 450, duration: 30, desc: "Corte de precisión adaptado a tu estilo personal" },
    { id: "2", name: "Corte + Barba", price: 750, duration: 60, desc: "El combo completo para el caballero moderno" },
    { id: "3", name: "Diseño de Barba", price: 350, duration: 30, desc: "Perfilado y mantenimiento profesional" }
  ],
  barbers: [
    { name: "Enzo", specialty: "Degradados (Fades), cortes modernos y texturizados" },
    { name: "Mateo", specialty: "Afeitado tradicional a navaja caliente (hot towel) y cuidado de barba" },
    { name: "Bruno", specialty: "Cortes clásicos a tijera y estilos retro/pompadour" }
  ],
  products: [
    { name: "Classic Pomade", price: 450, desc: "Cera base agua, fijación fuerte y brillo medio" },
    { name: "Beard Elixir", price: 380, desc: "Aceite premium de sándalo y argán para hidratar la barba" },
    { name: "Matte Clay", price: 480, desc: "Arcilla de acabado mate y alta fijación texturizada" }
  ],
  faq: {
    cancellation: "Podés cancelar o modificar tu turno de forma gratuita hasta 2 horas antes de la cita acordada a través del sistema web.",
    payment: "Aceptamos efectivo en el local, transferencias bancarias y pagos online vía MercadoPago.",
    delay: "Agradecemos llegar 5 o 10 minutos antes de tu cita. Si te demorás más de 10 minutos, es posible que debamos reprogramar el turno para no retrasar a los demás clientes."
  },
  styles: [
    { id: "1", name: "Fade Degradado Alto", serviceId: "1", tags: ["fade", "degradado", "moderno", "corto"] },
    { id: "2", name: "Perfilado de Barba", serviceId: "3", tags: ["barba", "perfilado", "tijera", "grooming"] },
    { id: "3", name: "Afeitado Hot Towel", serviceId: "3", tags: ["afeitado", "navaja", "tradicional", "spa"] },
    { id: "4", name: "Styling Texturizado", serviceId: "1", tags: ["styling", "textura", "corto", "peinado"] }
  ]
};

type AssistantData =
  | { type: "services"; items: typeof KNOWLEDGE_BASE.services }
  | { type: "branches"; items: typeof KNOWLEDGE_BASE.branches }
  | { type: "styles"; items: typeof KNOWLEDGE_BASE.styles }
  | { type: "products"; items: typeof KNOWLEDGE_BASE.products }
  | { type: "action"; label: string; url: string };

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage.content.toLowerCase();

    // Verificamos si existe clave de API de OpenAI o Gemini en el entorno para una integración real
    const geminiKey = process.env.GEMINI_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      // Integración con Google Gemini
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Eres el Asistente Virtual Inteligente de la barbería premium "New Brothers" en Uruguay. 
Tus respuestas deben ser educadas, profesionales, directas y con una estética premium.
Usa la siguiente base de conocimiento para responder las dudas del usuario de manera exacta:
${JSON.stringify(KNOWLEDGE_BASE)}

Reglas:
1. Responde solo con información real contenida aquí. Si te preguntan algo fuera de tema, guíalos amablemente de vuelta a los servicios de la barbería.
2. Si te preguntan por recomendaciones de cortes o estilos, sugiere uno de los estilos del Lookbook y menciónales que pueden reservarlo directamente.
3. Mantén un tono elegante y masculino premium.

Pregunta del cliente: "${lastMessage.content}"`
                  }
                ]
              }
            ]
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return NextResponse.json({
            role: "assistant",
            content: text
          });
        }
      }
    } else if (openAiKey) {
      // Integración con OpenAI
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Eres el Asistente Virtual Inteligente de la barbería premium "New Brothers" en Uruguay. Usa esta información para responder: ${JSON.stringify(KNOWLEDGE_BASE)}. Tono elegante, profesional y premium.`
            },
            ...messages
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return NextResponse.json({
            role: "assistant",
            content: text
          });
        }
      }
    }

    // ==========================================
    // FALLBACK INTELIGENTE (Motor de Reglas Semántico Local)
    // ==========================================
    let reply = "";
    let data: AssistantData | null = null; // Para retornar información estructurada a la UI

    // 1. Saludos
    if (userQuery.includes("hola") || userQuery.includes("buenas") || userQuery.includes("buen dia") || userQuery.includes("buena tarde")) {
      reply = "¡Hola! Bienvenido a **New Brothers**. Soy tu Asesor de Estética Masculina personal. ¿En qué te puedo ayudar hoy? Podés consultarme sobre nuestros servicios, reservar turnos, recomendaciones de cortes o conocer nuestros locales.";
    }
    // 2. Precios o Servicios
    else if (userQuery.includes("precio") || userQuery.includes("costo") || userQuery.includes("cuanto sale") || userQuery.includes("servicio") || userQuery.includes("menu")) {
      reply = "En **New Brothers** ofrecemos servicios de cuidado premium adaptados a tu estilo:\n\n" +
        KNOWLEDGE_BASE.services.map(s => `• **${s.name}**: $${s.price} | Duración: ${s.duration} min\n  _${s.desc}_`).join("\n") +
        "\n\n¿Te gustaría agendar alguno de estos servicios hoy?";
      data = {
        type: "services",
        items: KNOWLEDGE_BASE.services
      };
    }
    // 3. Reservas o Turnos
    else if (userQuery.includes("reserva") || userQuery.includes("turno") || userQuery.includes("agendar") || userQuery.includes("cita") || userQuery.includes("hora")) {
      reply = "Para agendar tu turno de forma rápida, podés hacer clic en el botón de abajo o visitar nuestra sección de reservas. Podrás elegir tu sucursal más cercana, tu barbero preferido y el horario de tu conveniencia.";
      data = {
        type: "action",
        label: "Reservar Turno Ahora",
        url: "/reservar"
      };
    }
    // 4. Ubicación o Sucursales
    else if (userQuery.includes("donde") || userQuery.includes("sucursal") || userQuery.includes("direccion") || userQuery.includes("local") || userQuery.includes("ubicacion")) {
      reply = "Contamos con tres sucursales premium en Uruguay:\n\n" +
        KNOWLEDGE_BASE.branches.map(b => `📍 **${b.name}**\n  Dirección: ${b.address}\n  Teléfono: ${b.phone}\n  Horario: ${b.hours}`).join("\n\n");
      data = {
        type: "branches",
        items: KNOWLEDGE_BASE.branches
      };
    }
    // 5. Barberos
    else if (userQuery.includes("barbero") || userQuery.includes("cortar") || userQuery.includes("quien") || userQuery.includes("equipo") || userQuery.includes("personal")) {
      reply = "Contamos con un equipo de profesionales altamente calificados listos para atenderte:\n\n" +
        KNOWLEDGE_BASE.barbers.map(b => `• **${b.name}**: Especialista en ${b.specialty}.`).join("\n") +
        "\n\nPodés elegir a cualquiera de ellos al agendar tu turno.";
    }
    // 6. Recomendaciones de Estilos o Cortes
    else if (userQuery.includes("recomienda") || userQuery.includes("corte") || userQuery.includes("estilo") || userQuery.includes("look") || userQuery.includes("peinado") || userQuery.includes("lookbook")) {
      reply = "¡Excelente! Basado en las tendencias actuales de estética masculina, te recomiendo revisar estos estilos de nuestro Lookbook. Podés hacer clic en cualquiera de ellos para agendar tu reserva con esa referencia visual:\n\n" +
        KNOWLEDGE_BASE.styles.map(s => `✂️ **${s.name}** (Ideal para servicio de ${KNOWLEDGE_BASE.services.find(ser => ser.id === s.serviceId)?.name})`).join("\n");
      data = {
        type: "styles",
        items: KNOWLEDGE_BASE.styles
      };
    }
    // 7. Productos
    else if (userQuery.includes("producto") || userQuery.includes("cera") || userQuery.includes("aceite") || userQuery.includes("shampoo") || userQuery.includes("tienda") || userQuery.includes("venta")) {
      reply = "Cuidamos tu cabello y barba también en casa. Aquí tenés algunos de nuestros productos premium disponibles en nuestra tienda:\n\n" +
        KNOWLEDGE_BASE.products.map(p => `🧴 **${p.name}** ($${p.price})\n  _${p.desc}_`).join("\n\n") +
        "\n\nPodés adquirirlos online y retirarlos en tu sucursal de preferencia.";
      data = {
        type: "products",
        items: KNOWLEDGE_BASE.products
      };
    }
    // 8. Cancelaciones o Políticas
    else if (userQuery.includes("cancelar") || userQuery.includes("reprogramar") || userQuery.includes("politica")) {
      reply = `**Políticas de Cancelación:** ${KNOWLEDGE_BASE.faq.cancellation}\n\n**Tolerancia de Retraso:** ${KNOWLEDGE_BASE.faq.delay}`;
    }
    // 9. Medios de Pago
    else if (userQuery.includes("pago") || userQuery.includes("tarjeta") || userQuery.includes("mercado") || userQuery.includes("efectivo")) {
      reply = `**Medios de Pago:** ${KNOWLEDGE_BASE.faq.payment}`;
    }
    // 10. Por defecto
    else {
      reply = "Entiendo. En **New Brothers** nos enfocamos en brindarte la mejor experiencia de barbería. Si tenés dudas específicas sobre cómo reservar, precios de cortes, ubicaciones de nuestros locales o querés recomendaciones de estilos, ¡preguntame con confianza!";
    }

    return NextResponse.json({
      role: "assistant",
      content: reply,
      data
    });
  } catch (error: unknown) {
    console.error("Error in chat API handler:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
