# Producción visual NB Barber

Assets generados con IA como demo de alta calidad. Para reemplazo real, mantener exactamente las mismas rutas y dimensiones mínimas.

## Criterios globales

- Estética: fotografía realista, barbería premium, compatible con tema híbrido claro/oscuro; base negro/charcoal con acentos dorados `#D4AF37`, usable también sobre fondos claros marfil/crema.
- Luz: cálida, tenue, tipo espejo/sillón/metal, sombras suaves.
- Evitar: texto dentro de imagen, marcas, logos de terceros, agua, manos deformes, fondos desordenados.
- Formatos finales: `.jpg` para hero/features/barberos y sucursales; Open Graph sale por `src/app/opengraph-image.tsx` en 1200x630.
- QA: sujeto reconocible en miniatura, sin duplicados exactos, buena lectura con overlays oscuros, usable en mobile.

## Assets y prompts

| Ruta | Prompt IA usado | Brief foto real |
|---|---|---|
| `public/images/hero/ambiente-barberia.jpg` | Interior premium con sillas de cuero negro, espejos, madera oscura, metal y luz ámbar. | Foto wide/interior del local con dos sillones, espejos y mostrador limpio. |
| `public/images/hero/herramientas-barberia.jpg` | Tijeras, navaja, peine negro y guardas metálicas sobre piedra oscura. | Still life de herramientas reales NB sobre estación negra, luz lateral cálida. |
| `public/images/hero/detalle-corte.jpg` | Manos del barbero cortando cabello con tijera y peine, fondo de barbería desenfocado. | Close-up real de corte en proceso, sin rostro completo, foco en técnica. |
| `public/images/hero/estilo-moderno.jpg` | Retrato de cliente con fade moderno, barba prolija y luz de espejo cálida. | Retrato after de cliente real, pecho arriba, fondo oscuro del local. |
| `public/images/hero/maquina-clippers.jpg` | Máquina profesional sobre cuero negro, metal/gold details, macro editorial. | Close-up de clipper real y peine/guardas sobre silla o estación. |
| `public/images/hero/detalle-barba.jpg` | Perfilado de barba con navaja, side profile, luz ámbar. | Foto de arreglo de barba real, sin sangre ni encuadre incómodo. |
| `public/images/hero/tijera-detalle.jpg` | Tijera artística sobre mármol negro, alto contraste, reflejo dorado. | Foto macro de tijera NB como recurso gráfico de lookbook. |
| `public/images/after-makeover.jpg` | After del retrato `before-makeover`: mismo encuadre, pelo corto y barba modelada. | Rehacer before/after con mismo cliente, cámara fija y luz idéntica. |
| `public/images/features/reservas-online.jpg` | Cliente usando smartphone para reservar, barbería cálida desenfocada. | Mano con teléfono sin UI legible, silla/espejo NB al fondo. |
| `public/images/features/productos-premium.jpg` | Productos grooming sin etiquetas en estante oscuro con tapas doradas. | Vitrina real de pomadas, aceites y bálsamos NB, sin marcas externas. |
| `public/images/features/producto-textura.jpg` | Macro de textura de cabello con producto mate en dedos. | Detalle real de styling/textura tras aplicar producto. |
| `public/images/branches/sucursal-central.jpg` | Interior urbano premium, dos sillones, espejos y madera oscura. | Foto wide de sede Central, sensación urbana/elegante. |
| `public/images/branches/sucursal-norte.jpg` | Sede de shopping con vidrio, luz más abierta, negro y ámbar. | Foto de sede Norte desde entrada, reflejos de shopping sin carteles externos. |
| `public/images/branches/sucursal-beach.jpg` | Barbería premium con luz costera fría al fondo y silla negra en primer plano. | Foto de sede Beach con referencia sutil a rambla/costa por ventana. |
| `public/images/barbers/carlos.jpg` | Retrato de Carlos, barbero 30s, apron negro, luz ámbar. | Retrato de Carlos real, pecho arriba, fondo oscuro y luz cálida. |
| `public/images/barbers/miguel.jpg` | Retrato de Miguel, experto en barba/urbano, apron negro. | Retrato de Miguel real con la misma iluminación del set. |
| `public/images/barbers/diego.jpg` | Retrato de Diego, senior, presencia calma, apron negro. | Retrato de Diego real, mismo encuadre que el resto del equipo. |
| `src/app/opengraph-image.tsx` | Composición controlada con logo, fondo de barbería y texto exacto. | Usar foto real del local + logo oficial; mantener 1200x630. |

## Reemplazo seguro

1. Exportar cada imagen final con la misma ruta.
2. Mantener dimensiones mínimas: 1600x1600, 1600x1200 o 1200x630 según corresponda.
3. Ejecutar `npm run build`.
4. Revisar home, reservar, lookbook, tienda, contacto y mi cuenta en desktop/mobile.
