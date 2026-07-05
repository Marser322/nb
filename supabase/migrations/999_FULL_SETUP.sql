-- =====================================================
-- NB BARBER - SCRIPT MAESTRO DE INSTALACIÓN
-- Copia todo este contenido y pégalo en Supabase > SQL Editor
-- Equivale a correr 001 → 010 sobre una DB fresca (incluye las
-- tablas branches/cash_movements/reminders_config/communication_logs
-- que antes solo vivían en src/lib/supabase_schema.sql).
-- pg_cron (PARTE final) requiere habilitar la extensión primero en
-- Dashboard > Database > Extensions.
-- =====================================================

-- =====================================================
-- PARTE 1: ESQUEMA Y TABLAS
-- =====================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('cliente', 'barbero', 'admin');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('mercadopago', 'efectivo', 'transferencia');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- TABLA: PROFILES
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'cliente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON profiles(auth_user_id);

-- TABLA: BARBERS
CREATE TABLE IF NOT EXISTS barbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    working_hours JSONB DEFAULT '{"lunes": {"start": "09:00", "end": "20:00"}, "martes": {"start": "09:00", "end": "20:00"}, "miercoles": {"start": "09:00", "end": "20:00"}, "jueves": {"start": "09:00", "end": "20:00"}, "viernes": {"start": "09:00", "end": "20:00"}, "sabado": {"start": "09:00", "end": "18:00"}}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: SERVICES
CREATE TABLE IF NOT EXISTS services (
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

-- INSERTAR SERVICIOS INICIALES
INSERT INTO services (name, description, price, duration_minutes, image_url, sort_order) VALUES
    ('Corte Clásico', 'Corte de precisión adaptado a tu estilo personal', 450, 30, '/images/hero/maquina-clippers.png', 1),
    ('Corte + Barba', 'El combo completo para el caballero moderno', 750, 60, '/images/hero/detalle-corte.png', 2),
    ('Diseño de Barba', 'Perfilado y mantenimiento profesional', 350, 30, '/images/hero/detalle-barba.png', 3);

-- TABLA: APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
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

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_barber_date ON appointments(barber_id, appointment_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_barber_slot 
ON appointments(barber_id, appointment_date, start_time) 
WHERE status NOT IN ('cancelled');

-- TABLA: PRODUCTS
CREATE TABLE IF NOT EXISTS products (
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

-- TABLA: ORDERS
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    status order_status DEFAULT 'pending',
    payment_method payment_method,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: ORDER_ITEMS
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL
);

-- TABLA: HAIRCUT_HISTORY
CREATE TABLE IF NOT EXISTS haircut_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    notes TEXT,
    photo_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: CASH_REGISTER
CREATE TABLE IF NOT EXISTS cash_register (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_type TEXT CHECK (payment_type IN ('efectivo', 'transferencia')) NOT NULL,
    register_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: LOOKBOOK
CREATE TABLE IF NOT EXISTS lookbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    instagram_url TEXT,
    tags TEXT[] DEFAULT '{}',
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (ROW LEVEL SECURITY)
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

-- POLICIES (Simplificadas para evitar errores si ya existen)
DO $$ BEGIN
    CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = auth_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = auth_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow insert during signup" ON profiles FOR INSERT WITH CHECK (auth.uid() = auth_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Anyone can view active barbers" ON barbers FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Anyone can view active services" ON services FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Clients view own appointments" ON appointments FOR SELECT USING (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Clients can create appointments" ON appointments FOR INSERT WITH CHECK (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Clients can update own appointments" ON appointments FOR UPDATE USING (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Anyone can view active products" ON products FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Clients view own orders" ON orders FOR SELECT USING (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Clients can create orders" ON orders FOR INSERT WITH CHECK (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Clients view own order items" ON order_items FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Clients view own history" ON haircut_history FOR SELECT USING (client_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Anyone can view lookbook" ON lookbook FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- TRIGGER: New User
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- =====================================================
-- PARTE 2: DATOS DE PRUEBA (BARBEROS Y PRODUCTOS)
-- =====================================================

INSERT INTO barbers (name, bio, avatar_url, is_active) VALUES
    ('Carlos', 'Especialista en cortes clásicos y modernos', '/images/barbers/carlos.jpg', true),
    ('Miguel', 'Experto en diseño de barba y estilos urbanos', '/images/barbers/miguel.jpg', true),
    ('Diego', 'Barbero con 10 años de experiencia', '/images/barbers/diego.jpg', true);

INSERT INTO products (name, description, price, stock, category, image_url, is_active) VALUES
    ('NB Matte Clay', 'Fijación fuerte, acabado mate natural', 750, 20, 'Styling', '/products/matte-clay.png', true),
    ('Beard Elixir - Sandalwood', 'Hidratación y brillo para tu barba', 600, 15, 'Barba', '/products/beard-elixir.png', true),
    ('Classic Pomade', 'Fijación media con brillo elegante', 550, 18, 'Styling', '/products/classic-pomade.png', true),
    ('Carbon Daily Shampoo', 'Limpieza profunda sin resecar el cabello', 450, 25, 'Cabello', '/products/shampoo.png', true),
    ('Post-Shave Cooling Balm', 'Suavidad y calma después del afeitado', 500, 12, 'Afeitado', '/products/cooling-balm.png', true);


-- =====================================================
-- PARTE 3: DATOS DE LOOKBOOK
-- =====================================================

DELETE FROM lookbook;

INSERT INTO lookbook (title, image_url, tags, is_featured, instagram_url) VALUES
    ('Fade Degradado Alto', '/lookbook/fade-cut.jpg', ARRAY['corte', 'fade', 'moderno'], true, 'https://instagram.com/newbrothers.uy'),
    ('Perfilado de Barba', '/lookbook/beard-trim.jpg', ARRAY['barba', 'grooming', 'tijera'], true, 'https://instagram.com/newbrothers.uy'),
    ('Afeitado Hot Towel', '/lookbook/hot-towel.jpg', ARRAY['afeitado', 'spa', 'clásico'], true, NULL),
    ('Styling Texturizado', '/lookbook/styling-pomade.jpg', ARRAY['styling', 'producto', 'textura'], false, NULL),
    ('Instrumentos de Precisión', '/lookbook/clipper-detail.jpg', ARRAY['herramientas', 'calidad'], false, NULL),
    ('Corte a Tijera', '/lookbook/scissor-cut.jpg', ARRAY['corte', 'tijera', 'clásico'], false, NULL),
    ('Ambiente Industrial', '/lookbook/barber-chair.jpg', ARRAY['local', 'ambiente'], false, NULL),
    ('Lavado Premium', '/lookbook/hair-wash.jpg', ARRAY['servicio', 'relax'], false, NULL);

-- =====================================================
-- PARTE 4: SUCURSALES, CAJA Y COMUNICACIONES
-- (tablas que antes solo existían en src/lib/supabase_schema.sql)
-- =====================================================

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    active BOOLEAN DEFAULT true, -- NOTA: la migración 011 (F8) lo renombra a is_active
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL CHECK (category IN ('service', 'product', 'tip', 'adjustment', 'supply', 'salary', 'rent', 'other')),
    amount DECIMAL(10, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
    description TEXT,
    reference_id UUID, -- ID de la cita o venta si corresponde
    branch_id UUID REFERENCES branches(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    days_since_last_visit INTEGER NOT NULL DEFAULT 30,
    message_template TEXT NOT NULL DEFAULT 'Hola {nombre}, hace tiempo no te vemos por NB Barber. ¡Reserva hoy y renueva tu estilo!',
    is_active BOOLEAN DEFAULT false,
    channel TEXT DEFAULT 'whatsapp',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name TEXT, -- Guardamos nombre por si el usuario no está registrado
    client_phone TEXT,
    message_sent TEXT,
    status TEXT CHECK (status IN ('sent', 'failed', 'delivered')),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
-- (las policies de estas tablas se crean en la PARTE 7, ya endurecidas)

-- Seed mínimo
INSERT INTO branches (name, address, active)
SELECT 'Casa Central', 'Av. Principal 1234', true
WHERE NOT EXISTS (SELECT 1 FROM branches);

INSERT INTO reminders_config (days_since_last_visit, message_template, is_active)
SELECT 25, '¡Hola! Hace 25 días de tu último corte en NB Barber. ¿Listo para volver? Reserva aquí: https://nbbarber.com', true
WHERE NOT EXISTS (SELECT 1 FROM reminders_config);


-- =====================================================
-- PARTE 5: CHECKOUT (004 + 005)
-- =====================================================

DO $$ BEGIN
    CREATE POLICY "Clients can insert order items"
      ON order_items
      FOR INSERT
      WITH CHECK (
        order_id IN (
          SELECT id FROM orders
          WHERE client_id IN (
            SELECT id FROM profiles WHERE auth_user_id = auth.uid()
          )
        )
      );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Función segura para descontar stock (SECURITY DEFINER salta RLS en products)
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_quantity INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET stock = stock - p_quantity
  WHERE id = p_product_id
  AND stock >= p_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %', p_product_id;
  END IF;
END;
$$;

-- Crea la orden, sus items y descuenta el stock en UNA sola transacción.
-- Los precios se leen de products: no se confía en los montos del cliente.
CREATE OR REPLACE FUNCTION create_order_with_items(
  p_payment_method payment_method,
  p_items JSONB -- [{"product_id": "...", "quantity": 1}, ...]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_order_id UUID;
  v_item RECORD;
  v_product RECORD;
  v_subtotal NUMERIC(10,2) := 0;
BEGIN
  SELECT id INTO v_client_id
  FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CARRITO_VACIO';
  END IF;

  -- Validar stock con lock de fila (FOR UPDATE) y calcular subtotal con precios reales
  FOR v_item IN
    SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
    FROM jsonb_array_elements(p_items) e
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;

    SELECT id, name, price, stock INTO v_product
    FROM products
    WHERE id = v_item.product_id AND is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE';
    END IF;

    IF v_product.stock < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', v_product.name;
    END IF;

    v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
  END LOOP;

  INSERT INTO orders (client_id, subtotal, total, status, payment_method)
  VALUES (v_client_id, v_subtotal, v_subtotal, 'pending', p_payment_method)
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
    FROM jsonb_array_elements(p_items) e
  LOOP
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT v_order_id, p.id, v_item.quantity, p.price
    FROM products p
    WHERE p.id = v_item.product_id;

    UPDATE products
    SET stock = stock - v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_order_with_items(payment_method, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_order_with_items(payment_method, JSONB) TO authenticated;


-- =====================================================
-- PARTE 6: FUNCIONES HELPER DE ROLES (006)
-- =====================================================

-- ¿El usuario actual es admin? (tolera profiles.id == auth.uid() o auth_user_id)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND role = 'admin'
  );
$$;

-- Barbero vinculado al usuario actual (NULL si no es barbero)
CREATE OR REPLACE FUNCTION current_barber_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id FROM barbers b
  JOIN profiles p ON b.profile_id = p.id
  WHERE (p.auth_user_id = auth.uid() OR p.id = auth.uid())
    AND b.is_active = true
  LIMIT 1;
$$;


-- =====================================================
-- PARTE 7: RLS ENDURECIDO PARA PRODUCCIÓN (006)
-- =====================================================

-- Sucursales: lectura pública, escritura solo admin
DROP POLICY IF EXISTS "Anyone can view active branches" ON branches;
CREATE POLICY "Anyone can view active branches" ON branches
  FOR SELECT USING (active = true OR is_admin());

DROP POLICY IF EXISTS "Admins manage branches" ON branches;
CREATE POLICY "Admins manage branches" ON branches
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Caja y comunicaciones: solo admin
DROP POLICY IF EXISTS "Admins manage cash movements" ON cash_movements;
CREATE POLICY "Admins manage cash movements" ON cash_movements
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage reminders config" ON reminders_config;
CREATE POLICY "Admins manage reminders config" ON reminders_config
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage communication logs" ON communication_logs;
CREATE POLICY "Admins manage communication logs" ON communication_logs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage cash register" ON cash_register;
CREATE POLICY "Admins manage cash register" ON cash_register
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Catálogo: lectura pública de activos, escritura solo admin
DROP POLICY IF EXISTS "Admins manage services" ON services;
CREATE POLICY "Admins manage services" ON services
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage products" ON products;
CREATE POLICY "Admins manage products" ON products
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage barbers" ON barbers;
CREATE POLICY "Admins manage barbers" ON barbers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage lookbook" ON lookbook;
CREATE POLICY "Admins manage lookbook" ON lookbook
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Citas: barbero ve y actualiza las asignadas a él, admin todo
DROP POLICY IF EXISTS "Barbers view own appointments" ON appointments;
CREATE POLICY "Barbers view own appointments" ON appointments
  FOR SELECT USING (barber_id = current_barber_id());

DROP POLICY IF EXISTS "Barbers update own appointments" ON appointments;
CREATE POLICY "Barbers update own appointments" ON appointments
  FOR UPDATE USING (barber_id = current_barber_id())
  WITH CHECK (barber_id = current_barber_id());

DROP POLICY IF EXISTS "Admins manage appointments" ON appointments;
CREATE POLICY "Admins manage appointments" ON appointments
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Disponibilidad de agenda sin exponer citas de otros clientes
CREATE OR REPLACE FUNCTION get_booked_slots(p_barber_id UUID, p_date DATE)
RETURNS TABLE (start_time TIME, end_time TIME)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.start_time, a.end_time
  FROM appointments a
  WHERE a.barber_id = p_barber_id
    AND a.appointment_date = p_date
    AND a.status IN ('pending', 'confirmed');
$$;

GRANT EXECUTE ON FUNCTION get_booked_slots(UUID, DATE) TO anon, authenticated;

-- Órdenes / items / historial: admin gestiona todo
DROP POLICY IF EXISTS "Admins manage orders" ON orders;
CREATE POLICY "Admins manage orders" ON orders
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage order items" ON order_items;
CREATE POLICY "Admins manage order items" ON order_items
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage haircut history" ON haircut_history;
CREATE POLICY "Admins manage haircut history" ON haircut_history
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Barbers manage own haircut history" ON haircut_history;
CREATE POLICY "Barbers manage own haircut history" ON haircut_history
  FOR ALL USING (barber_id = current_barber_id())
  WITH CHECK (barber_id = current_barber_id());

-- Perfiles: admin y barberos pueden ver perfiles de clientes
DROP POLICY IF EXISTS "Staff can view profiles" ON profiles;
CREATE POLICY "Staff can view profiles" ON profiles
  FOR SELECT USING (is_admin() OR current_barber_id() IS NOT NULL);

DROP POLICY IF EXISTS "Admins update profiles" ON profiles;
CREATE POLICY "Admins update profiles" ON profiles
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================
-- 007 — CRM: notas de cliente, logs vinculados, multi-sucursal,
-- perfiles walk-in y overview agregado de clientes.
-- =============================================================

-- Notas internas del cliente
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notes TEXT;

-- Vincular logs de mensajes al perfil
ALTER TABLE communication_logs
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Multi-sucursal: un barbero pertenece a una sucursal
ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- El admin necesita crear perfiles walk-in (sin auth_user_id) desde el panel
DROP POLICY IF EXISTS "Admins insert profiles" ON profiles;
CREATE POLICY "Admins insert profiles" ON profiles
  FOR INSERT WITH CHECK (is_admin());

-- Overview agregado de clientes: RPC
CREATE OR REPLACE FUNCTION get_clients_overview()
RETURNS TABLE (
  id UUID, full_name TEXT, phone TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ, notes TEXT,
  last_visit DATE, total_appointments BIGINT, total_spent NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.avatar_url, p.created_at, p.notes,
    MAX(a.appointment_date) FILTER (WHERE a.status = 'completed'),
    COUNT(a.id) FILTER (WHERE a.status = 'completed'),
    COALESCE(SUM(s.price) FILTER (WHERE a.status = 'completed'), 0)
      + COALESCE((SELECT SUM(o.total) FROM orders o
                  WHERE o.client_id = p.id
                    AND o.status IN ('paid','shipped','delivered')), 0)
  FROM profiles p
  LEFT JOIN appointments a ON a.client_id = p.id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE p.role = 'cliente'
  GROUP BY p.id;
END; $$;

GRANT EXECUTE ON FUNCTION get_clients_overview() TO authenticated;


-- =====================================================
-- MIGRACIÓN 008: TABLA DE SUSCRIPCIONES (TURNOS FIJOS RECURRENTES)
-- =====================================================

-- 1. Crear tabla de suscripciones
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE NOT NULL,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Domingo, 1 = Lunes, etc.
    start_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agregar columna en appointments para vincular cita a una suscripción
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

-- 3. Habilitar Row Level Security (RLS) en la tabla
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Definir políticas de acceso para subscriptions
DROP POLICY IF EXISTS "Clients view their own subscriptions" ON subscriptions;
CREATE POLICY "Clients view their own subscriptions" ON subscriptions
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM profiles 
      WHERE auth_user_id = auth.uid() OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients insert their own subscriptions" ON subscriptions;
CREATE POLICY "Clients insert their own subscriptions" ON subscriptions
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT id FROM profiles 
      WHERE auth_user_id = auth.uid() OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients update/cancel their own subscriptions" ON subscriptions;
CREATE POLICY "Clients update/cancel their own subscriptions" ON subscriptions
  FOR UPDATE USING (
    client_id IN (
      SELECT id FROM profiles 
      WHERE auth_user_id = auth.uid() OR id = auth.uid()
    )
  );

-- Políticas para barberos y admins
DROP POLICY IF EXISTS "Admins manage all subscriptions" ON subscriptions;
CREATE POLICY "Admins manage all subscriptions" ON subscriptions
  FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Barbers view subscriptions assigned to them" ON subscriptions;
CREATE POLICY "Barbers view subscriptions assigned to them" ON subscriptions
  FOR SELECT USING (
    barber_id = current_barber_id()
  );


-- =============================================================
-- 009 — Integridad de reservas: anti-solapes a nivel DB,
-- RPC transaccional de reserva y cancelación con ventana de 2 h.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 006 y 008).
-- =============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Anti-solapes declarativo: protege wizard, admin/citas y el cron de
-- suscripciones por igual. tsrange es [) por defecto, así que una cita
-- que termina 10:30 no choca con otra que empieza 10:30.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    barber_id WITH =,
    tsrange(appointment_date + start_time, appointment_date + end_time) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

-- El índice único viejo queda redundante y genera un código de error
-- distinto (23505 vs 23P01), complicando el manejo en UI.
DROP INDEX IF EXISTS idx_unique_barber_slot;

-- El cliente ya no actualiza citas directo: pasa por cancel_appointment.
-- (La policy de 001 permitía cambiar fecha/hora/estado sin restricción.)
DROP POLICY IF EXISTS "Clients can update own appointments" ON appointments;

-- -------------------------------------------------------------
-- RPC de reserva: end_time server-side, suscripción + cita en UNA
-- transacción, y errores legibles para la UI.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION book_appointment(
  p_barber_id UUID,
  p_service_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_recurring BOOLEAN DEFAULT false,
  p_style_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_duration INT;
  v_end_time TIME;
  v_subscription_id UUID;
  v_appointment_id UUID;
BEGIN
  -- Perfil del usuario autenticado (patrón OR de 005: tolera ambos esquemas)
  SELECT id INTO v_client_id FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  SELECT duration_minutes INTO v_duration FROM services
  WHERE id = p_service_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICIO_NO_DISPONIBLE';
  END IF;

  -- No se confía en el end_time del cliente
  v_end_time := p_start_time + make_interval(mins => v_duration);

  -- appointment_date/start_time son hora local UY sin tz: comparar contra
  -- el reloj de Montevideo, no contra el del servidor (UTC).
  IF (p_date + p_start_time) <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'HORARIO_PASADO';
  END IF;

  IF p_recurring THEN
    INSERT INTO subscriptions (client_id, barber_id, service_id, day_of_week, start_time, status)
    VALUES (v_client_id, p_barber_id, p_service_id, EXTRACT(dow FROM p_date)::int, p_start_time, 'active')
    RETURNING id INTO v_subscription_id;
  END IF;

  BEGIN
    INSERT INTO appointments (client_id, barber_id, service_id, appointment_date,
      start_time, end_time, status, style_reference, notes, subscription_id)
    VALUES (v_client_id, p_barber_id, p_service_id, p_date,
      p_start_time, v_end_time, 'pending', p_style_reference, p_notes, v_subscription_id)
    RETURNING id INTO v_appointment_id;
  EXCEPTION WHEN exclusion_violation THEN
    -- Si falla la cita, el RAISE revierte también la suscripción (misma tx)
    RAISE EXCEPTION 'SLOT_OCUPADO';
  END;

  RETURN jsonb_build_object(
    'appointment_id', v_appointment_id,
    'subscription_id', v_subscription_id
  );
END; $$;

REVOKE EXECUTE ON FUNCTION book_appointment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION book_appointment TO authenticated;

-- -------------------------------------------------------------
-- Cancelación por el cliente con ventana de 2 h garantizada server-side.
-- NO toca la suscripción: cancelar una ocurrencia ≠ cancelar el turno fijo.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_appointment(p_appointment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_apt RECORD;
BEGIN
  SELECT id INTO v_client_id FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  SELECT * INTO v_apt FROM appointments
  WHERE id = p_appointment_id AND client_id = v_client_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CITA_NO_ENCONTRADA';
  END IF;

  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'NO_CANCELABLE';
  END IF;

  IF (v_apt.appointment_date + v_apt.start_time) - interval '2 hours'
     <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'FUERA_DE_VENTANA';
  END IF;

  UPDATE appointments SET status = 'cancelled' WHERE id = p_appointment_id;
END; $$;

REVOKE EXECUTE ON FUNCTION cancel_appointment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_appointment TO authenticated;


-- =============================================================
-- 010 — Generación automática de citas desde turnos fijos.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 009).
-- pg_cron: habilitar primero en Dashboard > Database > Extensions.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotente: se puede correr N veces sin duplicar. Si ya existe una cita
-- para esa ocurrencia (aunque esté cancelada) NO se regenera — cancelar una
-- ocurrencia significa saltearla esa semana. Si el slot lo tomó otro cliente,
-- el EXCLUDE de 009 dispara y se saltea con reason 'SLOT_OCUPADO'.
CREATE OR REPLACE FUNCTION generate_subscription_appointments(p_horizon_days INT DEFAULT 8)
RETURNS TABLE (out_subscription_id UUID, out_date DATE, out_created BOOLEAN, out_reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_date DATE;
  v_end_time TIME;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.client_id, s.barber_id, s.service_id, s.day_of_week,
           s.start_time, srv.duration_minutes
    FROM subscriptions s
    JOIN services srv ON srv.id = s.service_id
    WHERE s.status = 'active'
  LOOP
    v_end_time := v_sub.start_time + make_interval(mins => v_sub.duration_minutes);
    FOR i IN 0..p_horizon_days LOOP
      v_date := (now() AT TIME ZONE 'America/Montevideo')::date + i;
      CONTINUE WHEN EXTRACT(dow FROM v_date)::int != v_sub.day_of_week;
      CONTINUE WHEN i = 0
        AND v_sub.start_time <= (now() AT TIME ZONE 'America/Montevideo')::time;

      IF EXISTS (SELECT 1 FROM appointments a
                 WHERE a.subscription_id = v_sub.id AND a.appointment_date = v_date) THEN
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := false; out_reason := 'YA_EXISTE';
        RETURN NEXT; CONTINUE;
      END IF;

      BEGIN
        INSERT INTO appointments (client_id, barber_id, service_id, appointment_date,
          start_time, end_time, status, subscription_id, notes)
        VALUES (v_sub.client_id, v_sub.barber_id, v_sub.service_id, v_date,
          v_sub.start_time, v_end_time, 'confirmed', v_sub.id,
          'Generada automáticamente por turno fijo');
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := true; out_reason := NULL;
        RETURN NEXT;
      EXCEPTION WHEN exclusion_violation THEN
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := false; out_reason := 'SLOT_OCUPADO';
        RETURN NEXT;
      END;
    END LOOP;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION generate_subscription_appointments FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_subscription_appointments TO authenticated;

-- Corrida diaria 06:00 UTC = 03:00 Montevideo. Si se re-corre la migración,
-- cron.schedule con el mismo nombre actualiza el job existente.
SELECT cron.schedule(
  'generate-subscription-appointments',
  '0 6 * * *',
  'SELECT public.generate_subscription_appointments()'
);

