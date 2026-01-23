# NB Barber - Plataforma Digital

## 🎯 Visión del Proyecto
Plataforma digital para **NB Barber**, una barbería ubicada en Uruguay.

---

## 📋 Objetivos del Negocio

### 1. Gestión de Agenda
Eliminar el uso de papel/WhatsApp manual. El cliente debe poder elegir:
- **Barbero**
- **Servicio**
- **Día y Hora** disponible

### 2. Venta de Productos (E-commerce)
Tienda integrada para vender:
- Ceras
- Aceites
- Productos de cuidado capilar

### 3. Fidelización
Sistema de historial de cortes para que el cliente pueda pedir **"lo mismo de la vez pasada"**.

---

## 🔐 Roles de Usuario

| Rol | Permisos |
|-----|----------|
| **Cliente** | Reserva citas, compra productos, ve su historial |
| **Barbero** | Ve su agenda, marca citas como completadas |
| **Admin** | Gestiona inventario, ve métricas, administra barberos |

---

## ⚙️ Reglas de Negocio Específicas

### Duración Variable de Servicios
| Servicio | Duración |
|----------|----------|
| Corte simple | 30 min |
| Corte + Barba | 60 min |

> ⚠️ El calendario debe **bloquear slots dinámicamente** según la duración del servicio elegido.

### Política de Cancelaciones
- Permitir cancelar hasta **2 horas antes** de la cita.

---

## 🛠️ Tech Stack

| Tecnología | Uso |
|------------|-----|
| **Next.js 14+** | Frontend (App Router) |
| **TypeScript** | Tipado estático |
| **Tailwind CSS** | Estilos |
| **Shadcn/UI** | Componentes UI |
| **Lucide React** | Iconos |
| **Supabase** | Auth, Database, Storage |

---

## 🎨 Estilo Visual
**"Lujo Minimalista para Barbería"**
- Colores oscuros con acentos dorados/ámbar
- Tipografías limpias (Inter o Geist)
- Bordes sutiles, sombras suaves
- Estética masculina y premium

---

## 📂 Workflows Disponibles
- `/setup` - Inicializar proyecto
- `/dev` - Servidor de desarrollo
- `/db-setup` - Configurar base de datos
- `/deploy` - Desplegar a Vercel
