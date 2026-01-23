---
description: Desplegar NB Barber a Vercel
---

# Deploy a Vercel

## Prerrequisitos
- Repositorio Git inicializado
- Cuenta de Vercel

## Pasos

1. Inicializar Git (si no está hecho)
```bash
git init
git add .
git commit -m "Initial commit"
```

2. Build de producción para verificar
// turbo
```bash
npm run build
```

3. Desplegar a Vercel
```bash
npx -y vercel --prod
```

## Variables de Entorno en Vercel
Configurar en el dashboard de Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
