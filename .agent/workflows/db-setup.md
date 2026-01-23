---
description: Configurar la base de datos de Supabase para NB Barber
---

# Configuración de Base de Datos - Supabase

## Tablas Requeridas

### 1. profiles (Usuarios extendidos)
- id (UUID, FK auth.users)
- role: 'cliente' | 'barbero' | 'admin'
- full_name
- phone
- avatar_url
- created_at

### 2. barbers (Barberos)
- id (UUID)
- user_id (FK profiles)
- name
- bio
- avatar_url
- is_active
- created_at

### 3. services (Servicios)
- id (UUID)
- name (ej: "Corte simple", "Corte + Barba")
- description
- price (decimal)
- duration_minutes (30, 60, etc.)
- is_active
- created_at

### 4. appointments (Citas)
- id (UUID)
- client_id (FK profiles)
- barber_id (FK barbers)
- service_id (FK services)
- appointment_date (date)
- start_time (time)
- end_time (time)
- status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
- notes
- created_at

### 5. products (Productos e-commerce)
- id (UUID)
- name
- description
- price (decimal)
- stock
- image_url
- category
- is_active
- created_at

### 6. orders (Órdenes)
- id (UUID)
- client_id (FK profiles)
- total (decimal)
- status: 'pending' | 'paid' | 'shipped' | 'delivered'
- created_at

### 7. order_items (Items de orden)
- id (UUID)
- order_id (FK orders)
- product_id (FK products)
- quantity
- unit_price

### 8. haircut_history (Historial de cortes - Fidelización)
- id (UUID)
- client_id (FK profiles)
- barber_id (FK barbers)
- service_id (FK services)
- notes (descripción del corte)
- photos (array URLs)
- appointment_id (FK appointments)
- created_at

## Ejecutar Migraciones
Usar las herramientas de Supabase MCP para aplicar las migraciones.
