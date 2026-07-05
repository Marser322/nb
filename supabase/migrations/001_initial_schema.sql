-- =====================================================
-- NB BARBER - ESQUEMA COMPLETO DE BASE DE DATOS
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. TIPOS ENUMERADOS
-- =====================================================
CREATE TYPE user_role AS ENUM ('cliente', 'barbero', 'admin');
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');
CREATE TYPE payment_method AS ENUM ('mercadopago', 'efectivo', 'transferencia');

-- 2. TABLA: PROFILES (Perfiles de usuario)
-- =====================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'cliente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_auth_user_id ON profiles(auth_user_id);

-- 3. TABLA: BARBERS (Barberos)
-- =====================================================
CREATE TABLE barbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    working_hours JSONB DEFAULT '{"lunes": {"start": "09:00", "end": "20:00"}, "martes": {"start": "09:00", "end": "20:00"}, "miercoles": {"start": "09:00", "end": "20:00"}, "jueves": {"start": "09:00", "end": "20:00"}, "viernes": {"start": "09:00", "end": "20:00"}, "sabado": {"start": "09:00", "end": "18:00"}}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA: SERVICES (Servicios)
-- =====================================================
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar servicios iniciales
INSERT INTO services (name, description, price, duration_minutes, image_url, sort_order) VALUES
    ('Corte Clásico', 'Corte de precisión adaptado a tu estilo personal', 450, 30, '/images/hero/maquina-clippers.png', 1),
    ('Corte + Barba', 'El combo completo para el caballero moderno', 750, 60, '/images/hero/detalle-corte.png', 2),
    ('Diseño de Barba', 'Perfilado y mantenimiento profesional', 350, 30, '/images/hero/detalle-barba.png', 3);

-- 5. TABLA: APPOINTMENTS (Citas)
-- =====================================================
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status appointment_status DEFAULT 'pending',
    notes TEXT,
    style_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas de disponibilidad
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_barber_date ON appointments(barber_id, appointment_date);

-- Constraint para prevenir overbooking
CREATE UNIQUE INDEX idx_unique_barber_slot 
ON appointments(barber_id, appointment_date, start_time) 
WHERE status NOT IN ('cancelled');

-- 6. TABLA: PRODUCTS (Productos e-commerce)
-- =====================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    image_url TEXT,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABLA: ORDERS (Órdenes)
-- =====================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    status order_status DEFAULT 'pending',
    payment_method payment_method,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TABLA: ORDER_ITEMS (Items de orden)
-- =====================================================
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL
);

-- 9. TABLA: HAIRCUT_HISTORY (Historial de cortes - Fidelización)
-- =====================================================
CREATE TABLE haircut_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    notes TEXT,
    photo_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. TABLA: CASH_REGISTER (Gestión de caja)
-- =====================================================
CREATE TABLE cash_register (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_type TEXT CHECK (payment_type IN ('efectivo', 'transferencia')) NOT NULL,
    register_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. TABLA: LOOKBOOK (Galería de estilos)
-- =====================================================
CREATE TABLE lookbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    instagram_url TEXT,
    tags TEXT[] DEFAULT '{}',
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE haircut_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookbook ENABLE ROW LEVEL SECURITY;

-- PROFILES: Políticas
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = auth_user_id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = auth_user_id);
CREATE POLICY "Allow insert during signup" ON profiles FOR INSERT WITH CHECK (auth.uid() = auth_user_id);

-- BARBERS: Todos pueden ver barberos activos
CREATE POLICY "Anyone can view active barbers" ON barbers FOR SELECT USING (is_active = true);

-- SERVICES: Todos pueden ver servicios activos
CREATE POLICY "Anyone can view active services" ON services FOR SELECT USING (is_active = true);

-- APPOINTMENTS: Clientes ven sus citas
CREATE POLICY "Clients view own appointments" ON appointments FOR SELECT 
USING (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Clients can create appointments" ON appointments FOR INSERT 
WITH CHECK (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Clients can update own appointments" ON appointments FOR UPDATE 
USING (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- PRODUCTS: Todos pueden ver productos activos
CREATE POLICY "Anyone can view active products" ON products FOR SELECT USING (is_active = true);

-- ORDERS: Clientes ven sus órdenes
CREATE POLICY "Clients view own orders" ON orders FOR SELECT 
USING (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Clients can create orders" ON orders FOR INSERT 
WITH CHECK (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- ORDER_ITEMS: Clientes ven items de sus órdenes
CREATE POLICY "Clients view own order items" ON order_items FOR SELECT 
USING (order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())));

-- HAIRCUT_HISTORY: Clientes ven su historial
CREATE POLICY "Clients view own history" ON haircut_history FOR SELECT 
USING (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- LOOKBOOK: Todos pueden ver lookbook
CREATE POLICY "Anyone can view lookbook" ON lookbook FOR SELECT USING (true);

-- =====================================================
-- TRIGGER: Crear perfil automáticamente al registrarse
-- =====================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (auth_user_id, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- ¡LISTO! Base de datos configurada para NB Barber
-- =====================================================
