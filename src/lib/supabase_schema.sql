-- NB BARBER - DATABASE SCHEMA
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA DE SUCURSALES (Branches)
CREATE TABLE IF NOT EXISTS branches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE MOVIMIENTOS DE CAJA (Cash Movements)
CREATE TABLE IF NOT EXISTS cash_movements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL CHECK (category IN ('service', 'product', 'tip', 'adjustment', 'supply', 'salary', 'rent', 'other')),
    amount DECIMAL(10, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
    description TEXT,
    reference_id UUID, -- ID de la cita o venta si corresponde
    branch_id UUID REFERENCES branches(id), -- Opcional: si manejas múltiples cajas
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CONFIGURACIÓN DE RECORDATORIOS (Reminders Config)
CREATE TABLE IF NOT EXISTS reminders_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    days_since_last_visit INTEGER NOT NULL DEFAULT 30,
    message_template TEXT NOT NULL DEFAULT 'Hola {nombre}, hace tiempo no te vemos por NB Barber. ¡Reserva hoy y renueva tu estilo!',
    is_active BOOLEAN DEFAULT false,
    channel TEXT DEFAULT 'whatsapp',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. LOG DE COMUNICACIONES (Communication Logs)
CREATE TABLE IF NOT EXISTS communication_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_name TEXT, -- Guardamos nombre por si el usuario no está registrado
    client_phone TEXT,
    message_sent TEXT,
    status TEXT CHECK (status IN ('sent', 'failed', 'delivered')),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- 6. POLÍTICAS DE SEGURIDAD (RLS)
-- Habilitar RLS en todas las tablas nuevas
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;

-- Políticas 'Abiertas' para desarrolladores (Ajustar en producción para solo admins)
-- Permitir todo acceso a usuarios autenticados (o anon si es necesario para el demo)

-- Policies for branches
CREATE POLICY "Enable all access for authenticated users on branches"
ON branches FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable read access for anon on branches"
ON branches FOR SELECT TO anon USING (true); -- Clientes necesitan ver sucursales

-- Policies for cash_movements
CREATE POLICY "Enable all access for authenticated users on cash_movements"
ON cash_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies for reminders_config
CREATE POLICY "Enable all access for authenticated users on reminders_config"
ON reminders_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies for communication_logs
CREATE POLICY "Enable all access for authenticated users on communication_logs"
ON communication_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INSERTAR DATOS INICIALES (Seed Data)
-- Crear una sucursal por defecto si no existe
INSERT INTO branches (name, address, active)
SELECT 'Casa Central', 'Av. Principal 1234', true
WHERE NOT EXISTS (SELECT 1 FROM branches);

-- Configuración de recordatorio por defecto
INSERT INTO reminders_config (days_since_last_visit, message_template, is_active)
SELECT 25, '¡Hola! Hace 25 días de tu último corte en NB Barber. ¿Listo para volver? Reserva aquí: https://nbbarber.com', true
WHERE NOT EXISTS (SELECT 1 FROM reminders_config);
