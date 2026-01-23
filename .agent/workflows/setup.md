---
description: Inicializar el proyecto NB Barber desde cero con Next.js, Supabase y Shadcn/UI
---

# Setup Inicial - NB Barber

## Prerrequisitos
- Node.js 18+ instalado
- Cuenta de Supabase creada

## Pasos

// turbo-all

1. Crear proyecto Next.js con TypeScript y Tailwind
```bash
npx -y create-next-app@latest ./ --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

2. Instalar dependencias de Shadcn/UI
```bash
npx -y shadcn@latest init -d
```

3. Instalar componentes base de Shadcn
```bash
npx -y shadcn@latest add button card input label select dialog sheet tabs avatar badge calendar dropdown-menu form toast sonner
```

4. Instalar dependencias adicionales
```bash
npm install @supabase/supabase-js @supabase/ssr lucide-react date-fns zustand
```

5. Crear estructura de carpetas
```bash
mkdir -p src/lib src/components/ui src/components/layout src/components/booking src/components/shop src/hooks src/types
```

6. Iniciar servidor de desarrollo
```bash
npm run dev
```

## Siguiente paso
Una vez completado, ejecutar `/db-setup` para configurar Supabase.
