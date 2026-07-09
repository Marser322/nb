-- =====================================================
-- NB BARBER - SCRIPT MAESTRO DE INSTALACIÓN
-- Copia todo este contenido y pégalo en Supabase > SQL Editor
-- Actualizado 2026-07-07. Equivale a correr 001 → 020 sobre una DB fresca,
-- excepto 017_fix_service_images.sql (solo corrige DBs existentes con seeds viejos).
-- Incluye branches/cash_movements/reminders_config/communication_logs,
-- backend de tienda (019) y RBAC/permisos granulares con rol `gerente` (020).
-- pg_cron (PARTE final) requiere habilitar la extensión primero en
-- Dashboard > Database > Extensions.
--
-- OJO con 020 (RBAC) en DB EXISTENTE: el `ALTER TYPE user_role ADD VALUE
-- 'gerente'` no puede compartir transacción con el uso de ese valor nuevo.
-- Si corrés esto de una sola pasada en el SQL Editor y falla con un error de
-- "unsafe use of new value of enum type", volvé a correr el archivo completo
-- una segunda vez (el ALTER TYPE ya habrá quedado aplicado y el resto sí
-- podrá usar 'gerente'). Ver supabase/migrations/020_rbac_permisos.sql para
-- instrucciones detalladas de una migración por partes.
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

-- Permite que scripts locales con service_role actualicen profiles via Data API.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO service_role;

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
-- FASE 26 / migración 021: columna `category` incluida (códigos EN, labels ES en constants.ts).
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'corte' CHECK (category IN ('corte', 'barba', 'combo', 'tratamiento', 'color', 'otro')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INSERTAR SERVICIOS INICIALES
INSERT INTO services (name, description, price, duration_minutes, image_url, sort_order, category) VALUES
    ('Corte Clásico', 'Corte de precisión adaptado a tu estilo personal', 450, 30, '/images/hero/maquina-clippers.jpg', 1, 'corte'),
    ('Corte + Barba', 'El combo completo para el caballero moderno', 750, 60, '/images/hero/detalle-corte.jpg', 2, 'combo'),
    ('Diseño de Barba', 'Perfilado y mantenimiento profesional', 350, 30, '/images/hero/detalle-barba.jpg', 3, 'barba');

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
    ('NB Matte Clay', 'Fijación fuerte, acabado mate natural', 750, 20, 'Styling', '/products/matte-clay.webp', true),
    ('Beard Elixir - Sandalwood', 'Hidratación y brillo para tu barba', 600, 15, 'Barba', '/products/beard-elixir.webp', true),
    ('Classic Pomade', 'Fijación media con brillo elegante', 550, 18, 'Styling', '/products/classic-pomade.webp', true),
    ('Carbon Daily Shampoo', 'Limpieza profunda sin resecar el cabello', 450, 25, 'Cabello', '/products/shampoo.webp', true),
    ('Post-Shave Cooling Balm', 'Suavidad y calma después del afeitado', 500, 12, 'Afeitado', '/products/cooling-balm.webp', true);


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
    is_active BOOLEAN DEFAULT true,
    working_hours JSONB DEFAULT '{"lunes": {"start": "09:00", "end": "20:00"}, "martes": {"start": "09:00", "end": "20:00"}, "miercoles": {"start": "09:00", "end": "20:00"}, "jueves": {"start": "09:00", "end": "20:00"}, "viernes": {"start": "09:00", "end": "20:00"}, "sabado": {"start": "09:00", "end": "18:00"}}'::jsonb,
    image_url TEXT,
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
INSERT INTO branches (name, address, is_active)
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
  FOR SELECT USING (is_active = true OR is_admin());

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
-- 011 — Disponibilidad: bloqueos y RPC de disponibilidad
-- -------------------------------------------------------------

-- Bloqueos: vacaciones de barbero, feriado de sucursal, bloqueo puntual.
-- start_time/end_time NULL (ambos) = día(s) completo(s).
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date),
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NULL OR end_time > start_time),
  CHECK (barber_id IS NOT NULL OR branch_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_barber
  ON schedule_blocks(barber_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_branch
  ON schedule_blocks(branch_id, start_date, end_date);

ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage schedule blocks" ON schedule_blocks;
CREATE POLICY "Admins manage schedule blocks" ON schedule_blocks
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Barbers manage own blocks" ON schedule_blocks;
CREATE POLICY "Barbers manage own blocks" ON schedule_blocks
  FOR ALL USING (barber_id = current_barber_id())
  WITH CHECK (barber_id = current_barber_id() AND branch_id IS NULL);

-- RPC único de disponibilidad
CREATE OR REPLACE FUNCTION get_availability(
  p_barber_id UUID,
  p_from DATE,
  p_to DATE DEFAULT NULL
) RETURNS TABLE (
  day DATE,
  is_open BOOLEAN,
  open_time TIME,
  close_time TIME,
  break_start TIME,
  break_end TIME,
  slot_minutes INT,
  booked JSONB,
  blocks JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_barber RECORD;
  v_to DATE;
  v_day DATE;
  v_key TEXT;
  v_hours JSONB;
  v_day_blocks JSONB;
  v_full_day_block BOOLEAN;
BEGIN
  v_to := LEAST(COALESCE(p_to, p_from), p_from + 30);  -- cap 31 días

  SELECT b.working_hours AS barber_hours, b.branch_id,
         br.working_hours AS branch_hours
  INTO v_barber
  FROM barbers b
  LEFT JOIN branches br ON br.id = b.branch_id
  WHERE b.id = p_barber_id AND b.is_active = true;
  IF NOT FOUND THEN RETURN; END IF;

  v_day := p_from;
  WHILE v_day <= v_to LOOP
    v_key := (ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])
             [EXTRACT(dow FROM v_day)::int + 1];
    v_hours := COALESCE(v_barber.barber_hours -> v_key, v_barber.branch_hours -> v_key);
    IF v_hours = 'null'::jsonb THEN v_hours := NULL; END IF;

    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'start', COALESCE(sb.start_time::text, '00:00'),
        'end',   COALESCE(sb.end_time::text,   '23:59'),
        'reason', sb.reason) ORDER BY sb.start_time NULLS FIRST), '[]'::jsonb),
      COALESCE(bool_or(sb.start_time IS NULL), false)
    INTO v_day_blocks, v_full_day_block
    FROM schedule_blocks sb
    WHERE v_day BETWEEN sb.start_date AND sb.end_date
      AND (sb.barber_id = p_barber_id
           OR (sb.branch_id IS NOT NULL AND sb.branch_id = v_barber.branch_id));

    day := v_day;
    slot_minutes := 30;
    blocks := v_day_blocks;
    IF v_hours IS NULL OR v_full_day_block THEN
      is_open := false;
      open_time := NULL; close_time := NULL;
      break_start := NULL; break_end := NULL;
      booked := '[]'::jsonb;
    ELSE
      is_open := true;
      open_time := (v_hours->>'start')::time;
      close_time := (v_hours->>'end')::time;
      break_start := (v_hours->>'break_start')::time;
      break_end := (v_hours->>'break_end')::time;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'start', a.start_time::text, 'end', a.end_time::text)
        ORDER BY a.start_time), '[]'::jsonb)
      INTO booked
      FROM appointments a
      WHERE a.barber_id = p_barber_id AND a.appointment_date = v_day
        AND a.status IN ('pending', 'confirmed');
    END IF;
    RETURN NEXT;
    v_day := v_day + 1;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION get_availability(UUID, DATE, DATE) TO anon, authenticated;

-- Validación server-side de slot
CREATE OR REPLACE FUNCTION is_slot_bookable(
  p_barber_id UUID, p_date DATE, p_start TIME, p_end TIME
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT * INTO v FROM get_availability(p_barber_id, p_date) LIMIT 1;
  IF NOT FOUND OR NOT v.is_open THEN RETURN false; END IF;
  IF p_start < v.open_time OR p_end > v.close_time THEN RETURN false; END IF;
  IF v.break_start IS NOT NULL
     AND p_start < v.break_end AND v.break_start < p_end THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v.blocks) blk
    WHERE p_start < (blk->>'end')::time AND (blk->>'start')::time < p_end
  ) THEN RETURN false; END IF;
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION is_slot_bookable(UUID, DATE, TIME, TIME) TO anon, authenticated;

-- RPC de reserva: end_time server-side, suscripción + cita en UNA
-- transacción, y errores legibles para la UI.
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

  -- Validación de disponibilidad y bloqueos
  IF NOT is_slot_bookable(p_barber_id, p_date, p_start_time, v_end_time) THEN
    RAISE EXCEPTION 'FUERA_DE_HORARIO';
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


-- =============================================================
-- 012 — Contabilidad: compensación por barbero, cobro de citas,
-- propinas y liquidaciones. Ejecutar a mano en el SQL Editor
-- (requiere 009 por btree_gist).
-- =============================================================

-- 1. Compensación por barbero, con vigencia histórica: la UI siempre
--    INSERTA una fila nueva (nunca UPDATE) — la liquidación de un período
--    usa la fila vigente a esa fecha.
CREATE TYPE compensation_model AS ENUM ('commission', 'chair_rental', 'hybrid', 'employee');

CREATE TABLE IF NOT EXISTS barber_compensation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  model compensation_model NOT NULL DEFAULT 'commission',
  commission_pct NUMERIC(5,2) CHECK (commission_pct BETWEEN 0 AND 100), -- % que gana el BARBERO
  rental_amount NUMERIC(10,2),
  rental_period TEXT CHECK (rental_period IN ('weekly', 'monthly')),
  salary_amount NUMERIC(10,2),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (barber_id, effective_from)
);
ALTER TABLE barber_compensation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage compensation" ON barber_compensation;
CREATE POLICY "Admins manage compensation" ON barber_compensation
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Barbers view own compensation" ON barber_compensation;
CREATE POLICY "Barbers view own compensation" ON barber_compensation
  FOR SELECT USING (barber_id = current_barber_id());

-- 2. Extender cash_movements para atribuir movimientos a barbero/cita
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS barber_id UUID REFERENCES barbers(id);
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_barber ON cash_movements(barber_id, created_at);

-- Normalización defensiva de datos legados en español (si los hubiera)
UPDATE cash_movements SET type = CASE type
  WHEN 'ingreso' THEN 'income' WHEN 'egreso' THEN 'expense' ELSE type END;
UPDATE cash_movements SET payment_method = CASE payment_method
  WHEN 'efectivo' THEN 'cash' WHEN 'tarjeta' THEN 'card'
  WHEN 'transferencia' THEN 'transfer' ELSE payment_method END;

-- Categorías nuevas: chair_rental (renta cobrada al barbero) y
-- settlement (pago de liquidación al barbero)
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_category_check;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_category_check
  CHECK (category IN ('service', 'product', 'tip', 'adjustment', 'supply',
                      'salary', 'rent', 'chair_rental', 'settlement', 'other'));

-- El barbero ve sus propios movimientos (escribe solo vía RPC)
DROP POLICY IF EXISTS "Barbers view own movements" ON cash_movements;
CREATE POLICY "Barbers view own movements" ON cash_movements
  FOR SELECT USING (barber_id = current_barber_id());

-- 3. Migrar la tabla legacy cash_register (sin referencias en src/) y borrarla.
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cash_register') THEN
    INSERT INTO cash_movements (type, category, amount, payment_method, description,
                                barber_id, created_at)
    SELECT 'income', 'service', cr.amount,
      CASE cr.payment_type WHEN 'efectivo' THEN 'cash'
                           WHEN 'transferencia' THEN 'transfer' ELSE 'other' END,
      'Migrado de cash_register', cr.barber_id,
      COALESCE(cr.created_at, cr.register_date::timestamptz)
    FROM cash_register cr;

    DROP POLICY IF EXISTS "Admins manage cash register" ON cash_register;
    DROP TABLE IF EXISTS cash_register;
  END IF;
END $$;

-- Anti doble cobro: una cita tiene a lo sumo UN movimiento de servicio.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_appointment_service
  ON cash_movements(appointment_id) WHERE category = 'service';

-- 4. RPC de cobro al completar cita (barbero dueño o admin)
CREATE OR REPLACE FUNCTION complete_appointment_with_payment(
  p_appointment_id UUID,
  p_final_amount NUMERIC,
  p_payment_method TEXT,
  p_tip_amount NUMERIC DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
BEGIN
  IF p_final_amount IS NULL OR p_final_amount < 0 THEN
    RAISE EXCEPTION 'MONTO_INVALIDO';
  END IF;
  IF p_tip_amount IS NULL OR p_tip_amount < 0 THEN
    RAISE EXCEPTION 'PROPINA_INVALIDA';
  END IF;
  IF p_payment_method NOT IN ('cash', 'card', 'transfer', 'other') THEN
    RAISE EXCEPTION 'METODO_INVALIDO';
  END IF;

  SELECT a.id, a.status, a.barber_id, a.client_id, a.service_id,
         b.branch_id AS barber_branch_id
  INTO v_apt
  FROM appointments a
  JOIN barbers b ON b.id = a.barber_id
  WHERE a.id = p_appointment_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN RAISE EXCEPTION 'CITA_NO_ENCONTRADA'; END IF;
  IF NOT (is_admin() OR v_apt.barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END IF;

  UPDATE appointments SET status = 'completed' WHERE id = p_appointment_id;

  BEGIN
    INSERT INTO cash_movements (type, category, amount, payment_method,
      description, barber_id, appointment_id, branch_id, created_by)
    VALUES ('income', 'service', p_final_amount, p_payment_method,
      'Cobro de cita', v_apt.barber_id, p_appointment_id,
      v_apt.barber_branch_id, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'YA_COBRADA';
  END;

  IF p_tip_amount > 0 THEN
    INSERT INTO cash_movements (type, category, amount, payment_method,
      description, barber_id, appointment_id, branch_id, created_by)
    VALUES ('income', 'tip', p_tip_amount, p_payment_method,
      'Propina', v_apt.barber_id, p_appointment_id,
      v_apt.barber_branch_id, auth.uid());
  END IF;

  -- Registrar en el historial de cortes (fidelización). Solo clientes con perfil.
  IF v_apt.client_id IS NOT NULL THEN
    INSERT INTO haircut_history (client_id, barber_id, service_id, appointment_id)
    VALUES (v_apt.client_id, v_apt.barber_id, v_apt.service_id, p_appointment_id);
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION complete_appointment_with_payment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_appointment_with_payment TO authenticated;

-- 5. Liquidación por barbero y período
CREATE OR REPLACE FUNCTION get_barber_settlement(
  p_barber_id UUID, p_from DATE, p_to DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp RECORD;
  v_model compensation_model;
  v_services NUMERIC := 0;
  v_tips NUMERIC := 0;
  v_count BIGINT := 0;
  v_barber_total NUMERIC := 0;
  v_house_total NUMERIC := 0;
  v_rental_due NUMERIC := 0;
BEGIN
  IF NOT (is_admin() OR p_barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_comp FROM barber_compensation
  WHERE barber_id = p_barber_id AND effective_from <= p_to
  ORDER BY effective_from DESC LIMIT 1;
  v_model := COALESCE(v_comp.model, 'commission'::compensation_model);

  SELECT COALESCE(SUM(amount) FILTER (WHERE category = 'service'), 0),
         COALESCE(SUM(amount) FILTER (WHERE category = 'tip'), 0),
         COUNT(*) FILTER (WHERE category = 'service')
  INTO v_services, v_tips, v_count
  FROM cash_movements
  WHERE barber_id = p_barber_id AND type = 'income'
    AND (created_at AT TIME ZONE 'America/Montevideo')::date BETWEEN p_from AND p_to;

  IF v_model = 'commission' THEN
    v_barber_total := round(v_services * COALESCE(v_comp.commission_pct, 0) / 100, 2);
    v_house_total := v_services - v_barber_total;
  ELSIF v_model = 'chair_rental' THEN
    v_barber_total := v_services;
    v_house_total := 0;
    v_rental_due := COALESCE(v_comp.rental_amount, 0);
  ELSIF v_model = 'hybrid' THEN
    v_barber_total := round(v_services * COALESCE(v_comp.commission_pct, 0) / 100, 2);
    v_house_total := v_services - v_barber_total;
    v_rental_due := COALESCE(v_comp.rental_amount, 0);
  ELSE -- employee
    v_barber_total := 0;
    v_house_total := v_services;
  END IF;

  v_barber_total := v_barber_total + v_tips;

  RETURN jsonb_build_object(
    'barber_id', p_barber_id, 'from', p_from, 'to', p_to,
    'model', v_model, 'commission_pct', v_comp.commission_pct,
    'rental_amount', v_comp.rental_amount, 'rental_period', v_comp.rental_period,
    'salary_amount', v_comp.salary_amount,
    'services_total', v_services, 'tips_total', v_tips,
    'appointments_count', v_count, 'rental_due', v_rental_due,
    'barber_total', v_barber_total, 'house_total', v_house_total,
    'has_compensation', v_comp.id IS NOT NULL
  );
END; $$;

REVOKE EXECUTE ON FUNCTION get_barber_settlement FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_barber_settlement TO authenticated;

-- 6. Cierre de liquidación
CREATE TABLE IF NOT EXISTS barber_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES barbers(id),
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  model compensation_model NOT NULL,
  services_total NUMERIC(10,2) NOT NULL,
  tips_total NUMERIC(10,2) NOT NULL,
  commission_pct NUMERIC(5,2),
  rental_amount NUMERIC(10,2),
  barber_total NUMERIC(10,2) NOT NULL,
  house_total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'paid')),
  payout_movement_id UUID REFERENCES cash_movements(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (period_to >= period_from),
  EXCLUDE USING gist (barber_id WITH =, daterange(period_from, period_to, '[]') WITH &&)
);
ALTER TABLE barber_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage settlements" ON barber_settlements;
CREATE POLICY "Admins manage settlements" ON barber_settlements
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Barbers view own settlements" ON barber_settlements;
CREATE POLICY "Barbers view own settlements" ON barber_settlements
  FOR SELECT USING (barber_id = current_barber_id());

CREATE OR REPLACE FUNCTION close_barber_settlement(
  p_barber_id UUID, p_from DATE, p_to DATE,
  p_register_payout BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v JSONB;
  v_settlement_id UUID;
  v_movement_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'NO_AUTORIZADO'; END IF;

  v := get_barber_settlement(p_barber_id, p_from, p_to);

  IF p_register_payout AND (v->>'barber_total')::numeric > 0 THEN
    INSERT INTO cash_movements (type, category, amount, payment_method,
      description, barber_id, created_by)
    VALUES ('expense', 'settlement', (v->>'barber_total')::numeric, 'cash',
      'Liquidación ' || p_from || ' a ' || p_to, p_barber_id, auth.uid())
    RETURNING id INTO v_movement_id;
  END IF;

  BEGIN
    INSERT INTO barber_settlements (barber_id, period_from, period_to, model,
      services_total, tips_total, commission_pct, rental_amount,
      barber_total, house_total, status, payout_movement_id, created_by)
    VALUES (p_barber_id, p_from, p_to, (v->>'model')::compensation_model,
      (v->>'services_total')::numeric, (v->>'tips_total')::numeric,
      (v->>'commission_pct')::numeric, (v->>'rental_amount')::numeric,
      (v->>'barber_total')::numeric, (v->>'house_total')::numeric,
      CASE WHEN p_register_payout THEN 'paid' ELSE 'closed' END,
      v_movement_id, auth.uid())
    RETURNING id INTO v_settlement_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'PERIODO_YA_LIQUIDADO';
  END;

  RETURN v_settlement_id;
END; $$;

REVOKE EXECUTE ON FUNCTION close_barber_settlement FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_barber_settlement TO authenticated;

-- =============================================================
-- 013 — Configuración de la aplicación y feature flags.
-- =============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read feature flags" ON app_settings;
CREATE POLICY "Public read feature flags" ON app_settings
  FOR SELECT USING (key LIKE 'feature.%' OR is_admin());
DROP POLICY IF EXISTS "Admins manage settings" ON app_settings;
CREATE POLICY "Admins manage settings" ON app_settings
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO app_settings (key, value, description) VALUES
  ('feature.tienda',        'true'::jsonb, 'Tienda online: /tienda, /checkout, carrito y link en navbar'),
  ('feature.suscripciones', 'true'::jsonb, 'Turnos fijos semanales (wizard paso 6, mi-cuenta, generación automática)'),
  ('feature.contabilidad',  'true'::jsonb, 'Cobro al completar cita, caja avanzada y liquidaciones'),
  ('feature.propinas',      'true'::jsonb, 'Campo propina en el diálogo de cobro'),
  ('feature.mensajes_crm',  'true'::jsonb, 'Mensajes y recordatorios por WhatsApp')
ON CONFLICT (key) DO NOTHING;

-- =============================================================
-- 015 — Nuevos feature flags para lookbook, reservas_online y portal_barbero.
-- =============================================================

INSERT INTO app_settings (key, value, description) VALUES
  ('feature.lookbook', 'true'::jsonb, 'Galería de estilos (lookbook)'),
  ('feature.reservas_online', 'true'::jsonb, 'Reservas online (wizard web)'),
  ('feature.portal_barbero', 'true'::jsonb, 'Portal de agenda para barberos')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- MIGRACIÓN 016: CONFIGURACIÓN DE STORAGE BUCKET 'MEDIA'
-- =====================================================

-- 1. Crear el bucket público 'media' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Eliminar políticas existentes para evitar conflictos
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Admin Insert Access" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Access" ON storage.objects;

-- 3. Crear política para permitir lectura pública de los archivos en 'media'
CREATE POLICY "Public Read Access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media');

-- 4. Crear política para permitir inserción de archivos en 'media' a admins autenticados
CREATE POLICY "Admin Insert Access" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.is_admin());

-- 5. Crear política para permitir actualización de archivos en 'media' a admins autenticados
CREATE POLICY "Admin Update Access" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media' AND public.is_admin())
  WITH CHECK (bucket_id = 'media' AND public.is_admin());

-- 6. Crear política para permitir borrado de archivos en 'media' a admins autenticados
CREATE POLICY "Admin Delete Access" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'media' AND public.is_admin());

-- =============================================================
-- 2026-07 — CRM paginado, agenda admin robusta e historial único
-- =============================================================

-- Una cita completada debe generar a lo sumo una fila de historial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_haircut_history_appointment_unique
  ON haircut_history(appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION record_haircut_history_for_appointment(
  p_appointment_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
BEGIN
  SELECT id, client_id, barber_id, service_id
  INTO v_apt
  FROM appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND OR v_apt.client_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO haircut_history (client_id, barber_id, service_id, appointment_id)
  VALUES (v_apt.client_id, v_apt.barber_id, v_apt.service_id, v_apt.id)
  ON CONFLICT (appointment_id) WHERE appointment_id IS NOT NULL DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_haircut_history_for_appointment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_haircut_history_for_appointment(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION appointments_completed_history_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM record_haircut_history_for_appointment(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_completed_history ON appointments;
CREATE TRIGGER trg_appointments_completed_history
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION appointments_completed_history_trigger();

REVOKE EXECUTE ON FUNCTION appointments_completed_history_trigger() FROM PUBLIC, anon;

-- Reemplaza la versión de 014: el trigger registra el historial con idempotencia.
CREATE OR REPLACE FUNCTION complete_appointment_with_payment(
  p_appointment_id UUID,
  p_final_amount NUMERIC,
  p_payment_method TEXT,
  p_tip_amount NUMERIC DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
BEGIN
  IF p_final_amount IS NULL OR p_final_amount < 0 THEN
    RAISE EXCEPTION 'MONTO_INVALIDO';
  END IF;
  IF p_tip_amount IS NULL OR p_tip_amount < 0 THEN
    RAISE EXCEPTION 'PROPINA_INVALIDA';
  END IF;
  IF p_payment_method NOT IN ('cash', 'card', 'transfer', 'other') THEN
    RAISE EXCEPTION 'METODO_INVALIDO';
  END IF;

  SELECT a.id, a.status, a.barber_id, b.branch_id AS barber_branch_id
  INTO v_apt
  FROM appointments a
  JOIN barbers b ON b.id = a.barber_id
  WHERE a.id = p_appointment_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN RAISE EXCEPTION 'CITA_NO_ENCONTRADA'; END IF;
  IF NOT (is_admin() OR v_apt.barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END IF;

  UPDATE appointments SET status = 'completed' WHERE id = p_appointment_id;

  BEGIN
    INSERT INTO cash_movements (type, category, amount, payment_method,
      description, barber_id, appointment_id, branch_id, created_by)
    VALUES ('income', 'service', p_final_amount, p_payment_method,
      'Cobro de cita', v_apt.barber_id, p_appointment_id,
      v_apt.barber_branch_id, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'YA_COBRADA';
  END;

  IF p_tip_amount > 0 THEN
    INSERT INTO cash_movements (type, category, amount, payment_method,
      description, barber_id, appointment_id, branch_id, created_by)
    VALUES ('income', 'tip', p_tip_amount, p_payment_method,
      'Propina', v_apt.barber_id, p_appointment_id,
      v_apt.barber_branch_id, auth.uid());
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_appointment_with_payment(UUID, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_appointment_with_payment(UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION admin_update_appointment_status(
  p_appointment_id UUID,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
  v_status appointment_status;
BEGIN
  BEGIN
    v_status := p_status::appointment_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END;

  SELECT id, barber_id, status
  INTO v_apt
  FROM appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'CITA_NO_EXISTE'; END IF;
  IF NOT (is_admin() OR v_apt.barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  UPDATE appointments
  SET status = v_status
  WHERE id = p_appointment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_update_appointment_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_update_appointment_status(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION admin_create_appointment(
  p_client_name TEXT,
  p_client_phone TEXT,
  p_service_id UUID,
  p_barber_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_duration INT;
  v_end_time TIME;
  v_appointment_id UUID;
  v_client_name TEXT := NULLIF(BTRIM(p_client_name), '');
  v_client_phone TEXT := NULLIF(BTRIM(p_client_phone), '');
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF v_client_name IS NULL THEN
    RAISE EXCEPTION 'CLIENTE_INVALIDO';
  END IF;

  SELECT duration_minutes INTO v_duration
  FROM services
  WHERE id = p_service_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICIO_INACTIVO'; END IF;

  IF NOT EXISTS (SELECT 1 FROM barbers WHERE id = p_barber_id AND is_active = true) THEN
    RAISE EXCEPTION 'BARBERO_INACTIVO';
  END IF;

  v_end_time := p_start_time + make_interval(mins => v_duration);

  IF (p_date + p_start_time) <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'HORARIO_PASADO';
  END IF;

  IF NOT is_slot_bookable(p_barber_id, p_date, p_start_time, v_end_time) THEN
    RAISE EXCEPTION 'FUERA_DE_HORARIO';
  END IF;

  IF v_client_phone IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM profiles
    WHERE phone = v_client_phone
      AND role = 'cliente'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO profiles (full_name, phone, role)
    VALUES (v_client_name, v_client_phone, 'cliente')
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE profiles
    SET full_name = COALESCE(NULLIF(full_name, ''), v_client_name)
    WHERE id = v_client_id;
  END IF;

  BEGIN
    INSERT INTO appointments (client_id, barber_id, service_id, appointment_date,
      start_time, end_time, status, notes)
    VALUES (v_client_id, p_barber_id, p_service_id, p_date,
      p_start_time, v_end_time, 'confirmed', p_notes)
    RETURNING id INTO v_appointment_id;
  EXCEPTION
    WHEN exclusion_violation OR unique_violation THEN
      RAISE EXCEPTION 'SLOT_OCUPADO';
  END;

  RETURN v_appointment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_create_appointment(TEXT, TEXT, UUID, UUID, DATE, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_create_appointment(TEXT, TEXT, UUID, UUID, DATE, TIME, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION admin_reschedule_appointment(
  p_appointment_id UUID,
  p_date DATE,
  p_start_time TIME
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
  v_duration INT;
  v_end_time TIME;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT a.id, a.status, a.barber_id, a.service_id, s.duration_minutes
  INTO v_apt
  FROM appointments a
  JOIN services s ON s.id = a.service_id
  WHERE a.id = p_appointment_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN RAISE EXCEPTION 'CITA_NO_EXISTE'; END IF;
  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END IF;

  v_duration := v_apt.duration_minutes;
  v_end_time := p_start_time + make_interval(mins => v_duration);

  IF (p_date + p_start_time) <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'HORARIO_PASADO';
  END IF;

  IF NOT is_slot_bookable(v_apt.barber_id, p_date, p_start_time, v_end_time) THEN
    RAISE EXCEPTION 'FUERA_DE_HORARIO';
  END IF;

  BEGIN
    UPDATE appointments
    SET appointment_date = p_date,
        start_time = p_start_time,
        end_time = v_end_time
    WHERE id = p_appointment_id;
  EXCEPTION
    WHEN exclusion_violation OR unique_violation THEN
      RAISE EXCEPTION 'SLOT_OCUPADO';
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_reschedule_appointment(UUID, DATE, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_reschedule_appointment(UUID, DATE, TIME) TO authenticated;

-- MIGRACION 024: birth_date + segmentación (ver detalle completo al final del archivo)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE OR REPLACE FUNCTION get_clients_overview_page(
  p_search TEXT DEFAULT NULL,
  p_inactive_only BOOLEAN DEFAULT false,
  p_inactive_days INT DEFAULT 30,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_sort TEXT DEFAULT 'recent',
  p_segment TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  birth_date DATE,
  created_at TIMESTAMPTZ,
  notes TEXT,
  last_visit DATE,
  total_appointments BIGINT,
  total_spent NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_search TEXT := LOWER(BTRIM(COALESCE(p_search, '')));
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_inactive_days INT := GREATEST(COALESCE(p_inactive_days, 30), 1);
  -- p_sort validado en SQL (nunca SQL dinámico): valor desconocido cae en 'recent'.
  v_sort TEXT := CASE WHEN p_sort IN ('recent', 'spent', 'visits', 'name') THEN p_sort ELSE 'recent' END;
  -- 'inactivos' como segmento es el mismo criterio que p_inactive_only (se mantiene por compatibilidad
  -- con llamadas legacy que solo pasan p_inactive_only).
  v_inactive_effective BOOLEAN := COALESCE(p_inactive_only, false) OR p_segment = 'inactivos';
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  RETURN QUERY
  WITH overview AS (
    SELECT
      p.id,
      p.full_name,
      p.phone,
      p.avatar_url,
      p.birth_date,
      p.created_at,
      p.notes,
      MAX(a.appointment_date) FILTER (WHERE a.status = 'completed')::DATE AS last_visit,
      COUNT(a.id) FILTER (WHERE a.status = 'completed')::BIGINT AS total_appointments,
      (
        COALESCE(SUM(s.price) FILTER (WHERE a.status = 'completed'), 0)
        + COALESCE((
          SELECT SUM(o.total)
          FROM orders o
          WHERE o.client_id = p.id
            AND o.status IN ('paid', 'shipped', 'delivered')
        ), 0)
      )::NUMERIC AS total_spent
    FROM profiles p
    LEFT JOIN appointments a ON a.client_id = p.id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE p.role = 'cliente'
    GROUP BY p.id
  ),
  filtered AS (
    SELECT *
    FROM overview o
    WHERE (
        v_search = ''
        OR LOWER(COALESCE(o.full_name, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(o.phone, '')) LIKE '%' || v_search || '%'
      )
      AND (
        NOT v_inactive_effective
        OR o.last_visit IS NULL
        OR o.last_visit < (CURRENT_DATE - v_inactive_days)
      )
      AND (
        p_segment IS DISTINCT FROM 'nuevos'
        OR o.created_at >= (NOW() - INTERVAL '30 days')
      )
      AND (
        p_segment IS DISTINCT FROM 'cumple_mes'
        OR (o.birth_date IS NOT NULL AND EXTRACT(MONTH FROM o.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE))
      )
  )
  SELECT
    f.id,
    f.full_name,
    f.phone,
    f.avatar_url,
    f.birth_date,
    f.created_at,
    f.notes,
    f.last_visit,
    f.total_appointments,
    f.total_spent,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN v_sort = 'spent' THEN f.total_spent END DESC NULLS LAST,
    CASE WHEN v_sort = 'visits' THEN f.total_appointments END DESC NULLS LAST,
    CASE WHEN v_sort = 'name' THEN f.full_name END ASC NULLS LAST,
    CASE WHEN v_sort = 'recent' AND v_inactive_effective THEN f.last_visit END ASC NULLS LAST,
    CASE WHEN v_sort = 'recent' AND NOT v_inactive_effective THEN f.last_visit END DESC NULLS LAST,
    f.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_clients_overview_page(TEXT, BOOLEAN, INT, INT, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_clients_overview_page(TEXT, BOOLEAN, INT, INT, INT, TEXT, TEXT) TO authenticated;
-- =====================================================
-- MIGRACION 019: BACKEND DE TIENDA
-- Stock por sucursal, pedidos online/locales, POS y caja.
-- Ejecutar en Supabase > SQL Editor. Idempotente para DBs existentes.
-- =====================================================

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('online', 'local');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fulfillment_type AS ENUM ('pickup', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type order_type NOT NULL DEFAULT 'online';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment fulfillment_type NOT NULL DEFAULT 'pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_orders_updated_at ON orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS product_stock (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (product_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_product_stock_branch ON product_stock(branch_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_product ON product_stock(product_id);

DROP TRIGGER IF EXISTS set_product_stock_updated_at ON product_stock;
CREATE TRIGGER set_product_stock_updated_at
  BEFORE UPDATE ON product_stock
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION recalculate_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  v_product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;

  UPDATE products
  SET stock = COALESCE((
    SELECT SUM(quantity)
    FROM product_stock
    WHERE product_id = v_product_id
  ), 0)
  WHERE id = v_product_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalculate_product_stock_after_change ON product_stock;
CREATE TRIGGER recalculate_product_stock_after_change
  AFTER INSERT OR UPDATE OR DELETE ON product_stock
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_product_stock();

-- Seed de migracion: en DBs existentes mueve el stock global actual a la primera
-- sucursal activa. Corre una vez por producto/sucursal gracias al ON CONFLICT.
DO $$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT id INTO v_branch_id
  FROM branches
  WHERE is_active = TRUE
  ORDER BY created_at
  LIMIT 1;

  IF v_branch_id IS NOT NULL THEN
    INSERT INTO product_stock (product_id, branch_id, quantity, low_stock_threshold)
    SELECT id, v_branch_id, COALESCE(stock, 0), COALESCE(low_stock_threshold, 5)
    FROM products
    WHERE COALESCE(stock, 0) > 0
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('sale_online', 'sale_local', 'adjustment', 'restock', 'cancel_restock')),
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON stock_movements(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_order_product
  ON cash_movements(reference_id)
  WHERE category = 'product' AND reference_id IS NOT NULL;

ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON product_stock FROM anon;
REVOKE ALL ON stock_movements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON product_stock FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON stock_movements FROM authenticated;
GRANT SELECT ON product_stock TO authenticated;
GRANT SELECT ON stock_movements TO authenticated;

DROP POLICY IF EXISTS "Admins manage product stock" ON product_stock;
CREATE POLICY "Admins manage product stock" ON product_stock
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Staff view branch product stock" ON product_stock;
CREATE POLICY "Staff view branch product stock" ON product_stock
  FOR SELECT USING (
    is_admin()
    OR branch_id IN (SELECT branch_id FROM barbers WHERE id = current_barber_id())
  );

DROP POLICY IF EXISTS "Admins view stock movements" ON stock_movements;
CREATE POLICY "Admins view stock movements" ON stock_movements
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins manage stock movements" ON stock_movements;
CREATE POLICY "Admins manage stock movements" ON stock_movements
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP FUNCTION IF EXISTS create_order_with_items(payment_method, JSONB);

CREATE OR REPLACE FUNCTION create_order_with_items(
  p_payment_method payment_method,
  p_items JSONB,
  p_branch_id UUID,
  p_fulfillment fulfillment_type DEFAULT 'pickup',
  p_contact_name TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_profile RECORD;
  v_order_id UUID;
  v_item RECORD;
  v_product RECORD;
  v_stock INTEGER;
  v_subtotal NUMERIC(10,2) := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT id, full_name, phone INTO v_profile
  FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;

  v_client_id := v_profile.id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CARRITO_VACIO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA';
  END IF;

  IF p_fulfillment = 'delivery' AND NULLIF(BTRIM(COALESCE(p_delivery_address, '')), '') IS NULL THEN
    RAISE EXCEPTION 'DIRECCION_REQUERIDA';
  END IF;

  IF p_fulfillment = 'delivery' AND NULLIF(BTRIM(COALESCE(p_contact_phone, v_profile.phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'TELEFONO_REQUERIDO';
  END IF;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::INT AS quantity
    FROM (
      SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
      FROM jsonb_array_elements(p_items) e
    ) parsed
    GROUP BY product_id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;

    SELECT id, name, price INTO v_product
    FROM products
    WHERE id = v_item.product_id AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE';
    END IF;

    SELECT quantity INTO v_stock
    FROM product_stock
    WHERE product_id = v_item.product_id AND branch_id = p_branch_id
    FOR UPDATE;

    IF v_stock IS NULL OR v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', v_product.name;
    END IF;

    v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
  END LOOP;

  INSERT INTO orders (
    client_id, branch_id, order_type, fulfillment, contact_name, contact_phone,
    delivery_address, notes, subtotal, total, status, payment_method, created_by
  )
  VALUES (
    v_client_id, p_branch_id, 'online', p_fulfillment,
    NULLIF(BTRIM(COALESCE(p_contact_name, v_profile.full_name, '')), ''),
    NULLIF(BTRIM(COALESCE(p_contact_phone, v_profile.phone, '')), ''),
    NULLIF(BTRIM(COALESCE(p_delivery_address, '')), ''),
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    v_subtotal, v_subtotal, 'pending', p_payment_method, auth.uid()
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::INT AS quantity
    FROM (
      SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
      FROM jsonb_array_elements(p_items) e
    ) parsed
    GROUP BY product_id
  LOOP
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT v_order_id, p.id, v_item.quantity, p.price
    FROM products p
    WHERE p.id = v_item.product_id;

    UPDATE product_stock
    SET quantity = quantity - v_item.quantity
    WHERE product_id = v_item.product_id AND branch_id = p_branch_id;

    INSERT INTO stock_movements (product_id, branch_id, delta, reason, reference_id, created_by)
    VALUES (v_item.product_id, p_branch_id, -v_item.quantity, 'sale_online', v_order_id, auth.uid());
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_order_with_items(payment_method, JSONB, UUID, fulfillment_type, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_order_with_items(payment_method, JSONB, UUID, fulfillment_type, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION create_counter_sale(
  p_branch_id UUID,
  p_payment_method payment_method,
  p_items JSONB,
  p_barber_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_barber_id UUID;
  v_is_admin BOOLEAN;
  v_order_id UUID;
  v_item RECORD;
  v_product RECORD;
  v_stock INTEGER;
  v_subtotal NUMERIC(10,2) := 0;
  v_cash_method TEXT;
BEGIN
  v_current_barber_id := current_barber_id();
  v_is_admin := is_admin();

  IF NOT (v_is_admin OR v_current_barber_id IS NOT NULL) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA';
  END IF;

  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM barbers WHERE id = v_current_barber_id AND branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA';
  END IF;

  IF p_barber_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM barbers WHERE id = p_barber_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'BARBERO_INVALIDO';
  END IF;

  IF NOT v_is_admin AND p_barber_id IS NOT NULL AND p_barber_id <> v_current_barber_id THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CARRITO_VACIO';
  END IF;

  v_cash_method := CASE p_payment_method
    WHEN 'efectivo' THEN 'cash'
    WHEN 'transferencia' THEN 'transfer'
    WHEN 'mercadopago' THEN 'transfer'
    ELSE 'other'
  END;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::INT AS quantity
    FROM (
      SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
      FROM jsonb_array_elements(p_items) e
    ) parsed
    GROUP BY product_id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;

    SELECT id, name, price INTO v_product
    FROM products
    WHERE id = v_item.product_id AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE';
    END IF;

    SELECT quantity INTO v_stock
    FROM product_stock
    WHERE product_id = v_item.product_id AND branch_id = p_branch_id
    FOR UPDATE;

    IF v_stock IS NULL OR v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', v_product.name;
    END IF;

    v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
  END LOOP;

  INSERT INTO orders (
    branch_id, order_type, fulfillment, contact_name, notes, subtotal, total,
    status, payment_method, created_by
  )
  VALUES (
    p_branch_id, 'local', 'pickup', 'Venta en local',
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    v_subtotal, v_subtotal, 'paid', p_payment_method, auth.uid()
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::INT AS quantity
    FROM (
      SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
      FROM jsonb_array_elements(p_items) e
    ) parsed
    GROUP BY product_id
  LOOP
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT v_order_id, p.id, v_item.quantity, p.price
    FROM products p
    WHERE p.id = v_item.product_id;

    UPDATE product_stock
    SET quantity = quantity - v_item.quantity
    WHERE product_id = v_item.product_id AND branch_id = p_branch_id;

    INSERT INTO stock_movements (product_id, branch_id, delta, reason, reference_id, created_by)
    VALUES (v_item.product_id, p_branch_id, -v_item.quantity, 'sale_local', v_order_id, auth.uid());
  END LOOP;

  INSERT INTO cash_movements (
    type, category, amount, payment_method, description, reference_id,
    branch_id, barber_id, created_by
  )
  VALUES (
    'income', 'product', v_subtotal, v_cash_method, 'Venta de mostrador',
    v_order_id, p_branch_id, COALESCE(p_barber_id, v_current_barber_id), auth.uid()
  )
  ON CONFLICT DO NOTHING;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_counter_sale(UUID, payment_method, JSONB, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_counter_sale(UUID, payment_method, JSONB, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_new_status order_status
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_cash_method TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDEN_NO_ENCONTRADA';
  END IF;

  IF v_order.status = p_new_status THEN
    RETURN;
  END IF;

  IF v_order.status IN ('cancelled', 'delivered') THEN
    RAISE EXCEPTION 'TRANSICION_INVALIDA';
  END IF;

  IF NOT (
    (v_order.status = 'pending' AND p_new_status IN ('paid', 'cancelled'))
    OR (v_order.status = 'paid' AND p_new_status IN ('shipped', 'delivered', 'cancelled'))
    OR (v_order.status = 'shipped' AND p_new_status IN ('delivered', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'TRANSICION_INVALIDA';
  END IF;

  IF p_new_status = 'cancelled' AND v_order.branch_id IS NOT NULL THEN
    FOR v_item IN
      SELECT product_id, quantity
      FROM order_items
      WHERE order_id = p_order_id AND product_id IS NOT NULL
    LOOP
      INSERT INTO product_stock (product_id, branch_id, quantity)
      VALUES (v_item.product_id, v_order.branch_id, v_item.quantity)
      ON CONFLICT (product_id, branch_id)
      DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity;

      INSERT INTO stock_movements (product_id, branch_id, delta, reason, reference_id, created_by)
      VALUES (v_item.product_id, v_order.branch_id, v_item.quantity, 'cancel_restock', p_order_id, auth.uid());
    END LOOP;
  END IF;

  UPDATE orders
  SET status = p_new_status
  WHERE id = p_order_id;

  IF p_new_status = 'paid' AND v_order.order_type = 'online' THEN
    v_cash_method := CASE v_order.payment_method
      WHEN 'efectivo' THEN 'cash'
      WHEN 'transferencia' THEN 'transfer'
      WHEN 'mercadopago' THEN 'transfer'
      ELSE 'other'
    END;

    INSERT INTO cash_movements (
      type, category, amount, payment_method, description, reference_id,
      branch_id, created_by
    )
    SELECT
      'income', 'product', v_order.total, v_cash_method,
      'Cobro de pedido online', v_order.id, v_order.branch_id, auth.uid()
    WHERE NOT EXISTS (
      SELECT 1
      FROM cash_movements
      WHERE reference_id = v_order.id AND category = 'product'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_order_status(UUID, order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_order_status(UUID, order_status) TO authenticated;

CREATE OR REPLACE FUNCTION set_product_stock(
  p_product_id UUID,
  p_branch_id UUID,
  p_new_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_quantity INTEGER := 0;
  v_delta INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'PRODUCTO_NO_ENCONTRADO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA';
  END IF;

  SELECT quantity INTO v_old_quantity
  FROM product_stock
  WHERE product_id = p_product_id AND branch_id = p_branch_id
  FOR UPDATE;

  v_old_quantity := COALESCE(v_old_quantity, 0);
  v_delta := p_new_quantity - v_old_quantity;

  INSERT INTO product_stock (product_id, branch_id, quantity)
  VALUES (p_product_id, p_branch_id, p_new_quantity)
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET quantity = EXCLUDED.quantity;

  IF v_delta <> 0 THEN
    INSERT INTO stock_movements (product_id, branch_id, delta, reason, created_by)
    VALUES (p_product_id, p_branch_id, v_delta, 'adjustment', auth.uid());
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_product_stock(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_product_stock(UUID, UUID, INTEGER) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'decrement_stock'
      AND pg_get_function_identity_arguments(p.oid) = 'p_product_id uuid, p_quantity integer'
  ) THEN
    REVOKE ALL ON FUNCTION decrement_stock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;


-- =====================================================
-- PARTE FINAL: MIGRACION 020 — RBAC Y PERMISOS GRANULARES
-- (rol `gerente`). Espejo de supabase/migrations/020_rbac_permisos.sql.
-- Ver el comentario al inicio de este archivo sobre correrlo en DOS
-- PASADAS en una DB existente (ALTER TYPE ADD VALUE + resto).
-- =====================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gerente';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN profiles.permissions IS
  'Overrides de permisos por persona. Clave = permiso (ver role_permissions), valor true=concede, false=revoca. Si la clave no está presente, se usa el default de role_permissions para el rol de la persona.';

CREATE TABLE IF NOT EXISTS role_permissions (
  role       user_role NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read role permissions" ON role_permissions;
CREATE POLICY "Anyone can read role permissions" ON role_permissions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage role permissions" ON role_permissions;
CREATE POLICY "Admins manage role permissions" ON role_permissions
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO role_permissions (role, permission) VALUES
  ('barbero', 'agenda.own'),
  ('barbero', 'clients.view'),
  ('barbero', 'cash.operate'),
  ('gerente', 'panel.access'),
  ('gerente', 'agenda.all'),
  ('gerente', 'cash.operate'),
  ('gerente', 'products.manage'),
  ('gerente', 'services.manage'),
  ('gerente', 'clients.manage'),
  ('gerente', 'reports.view'),
  ('admin', 'panel.access'),
  ('admin', 'agenda.own'),
  ('admin', 'agenda.all'),
  ('admin', 'finances.view'),
  ('admin', 'finances.manage'),
  ('admin', 'cash.operate'),
  ('admin', 'products.manage'),
  ('admin', 'services.manage'),
  ('admin', 'clients.view'),
  ('admin', 'clients.manage'),
  ('admin', 'staff.manage'),
  ('admin', 'branches.manage'),
  ('admin', 'reports.view'),
  ('admin', 'settings.manage')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION current_profile_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles
  WHERE (auth_user_id = auth.uid() OR id = auth.uid())
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_profile_role() TO authenticated;

CREATE OR REPLACE FUNCTION has_permission(perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      user_role;
  v_overrides JSONB;
BEGIN
  SELECT role, permissions INTO v_role, v_overrides
  FROM profiles
  WHERE (auth_user_id = auth.uid() OR id = auth.uid())
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  IF v_overrides IS NOT NULL AND v_overrides ? perm THEN
    RETURN COALESCE((v_overrides ->> perm)::boolean, FALSE);
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role = v_role AND rp.permission = perm
  );
END;
$$;

GRANT EXECUTE ON FUNCTION has_permission(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Admins manage compensation" ON barber_compensation;
CREATE POLICY "Admins manage compensation" ON barber_compensation
  FOR ALL USING (is_admin() OR has_permission('finances.manage'))
  WITH CHECK (is_admin() OR has_permission('finances.manage'));

DROP POLICY IF EXISTS "Staff view compensation with finances permission" ON barber_compensation;
CREATE POLICY "Staff view compensation with finances permission" ON barber_compensation
  FOR SELECT USING (has_permission('finances.view'));

DROP POLICY IF EXISTS "Admins manage settlements" ON barber_settlements;
CREATE POLICY "Admins manage settlements" ON barber_settlements
  FOR ALL USING (is_admin() OR has_permission('finances.manage'))
  WITH CHECK (is_admin() OR has_permission('finances.manage'));

DROP POLICY IF EXISTS "Staff view settlements with finances permission" ON barber_settlements;
CREATE POLICY "Staff view settlements with finances permission" ON barber_settlements
  FOR SELECT USING (has_permission('finances.view'));

DROP POLICY IF EXISTS "Admins manage cash movements" ON cash_movements;
CREATE POLICY "Admins manage cash movements" ON cash_movements
  FOR ALL USING (is_admin() OR has_permission('cash.operate'))
  WITH CHECK (is_admin() OR has_permission('cash.operate'));

DROP POLICY IF EXISTS "Admins manage services" ON services;
CREATE POLICY "Admins manage services" ON services
  FOR ALL USING (is_admin() OR has_permission('services.manage'))
  WITH CHECK (is_admin() OR has_permission('services.manage'));

DROP POLICY IF EXISTS "Admins manage products" ON products;
CREATE POLICY "Admins manage products" ON products
  FOR ALL USING (is_admin() OR has_permission('products.manage'))
  WITH CHECK (is_admin() OR has_permission('products.manage'));

DROP POLICY IF EXISTS "Admins manage branches" ON branches;
CREATE POLICY "Admins manage branches" ON branches
  FOR ALL USING (is_admin() OR has_permission('branches.manage'))
  WITH CHECK (is_admin() OR has_permission('branches.manage'));

DROP POLICY IF EXISTS "Admins manage appointments" ON appointments;
CREATE POLICY "Admins manage appointments" ON appointments
  FOR ALL USING (is_admin() OR has_permission('agenda.all'))
  WITH CHECK (is_admin() OR has_permission('agenda.all'));

DROP POLICY IF EXISTS "Staff can view profiles" ON profiles;
CREATE POLICY "Staff can view profiles" ON profiles
  FOR SELECT USING (
    is_admin()
    OR current_barber_id() IS NOT NULL
    OR has_permission('clients.view')
    OR has_permission('clients.manage')
    OR has_permission('staff.manage')
  );

DROP POLICY IF EXISTS "Admins update profiles" ON profiles;
CREATE POLICY "Admins update profiles" ON profiles
  FOR UPDATE USING (is_admin() OR has_permission('staff.manage'))
  WITH CHECK (is_admin() OR has_permission('staff.manage'));

CREATE OR REPLACE FUNCTION update_client_notes(p_client_id UUID, p_notes TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_admin() OR has_permission('clients.manage')) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  UPDATE profiles SET notes = p_notes WHERE id = p_client_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_client_notes(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_client_notes(UUID, TEXT) TO authenticated;


-- =====================================================
-- PARTE FINAL: MIGRACION 022 — PLANTILLAS DE MENSAJES POR EVENTO DE CITA
-- =====================================================
-- Espejo de supabase/migrations/022_message_templates.sql. NO toca reminders_config
-- (reactivación por inactividad, sigue exactamente igual).

CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (event_type IN ('cancelled', 'confirmed', 'rescheduled', 'reminder', 'thanks')),
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage message templates" ON message_templates;
CREATE POLICY "Admins manage message templates" ON message_templates
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'cancelled', 'Cancelación estándar',
  'Hola {nombre}, lamentamos avisarte que tuvimos que cancelar tu cita de {servicio} del {fecha} a las {hora}. Escribinos y te buscamos un nuevo horario que te quede bien. ¡Disculpá las molestias!',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'cancelled');

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'confirmed', 'Confirmación estándar',
  '¡Hola {nombre}! Te confirmamos tu cita de {servicio} el {fecha} a las {hora} con {barbero} en {sucursal}. ¡Te esperamos!',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'confirmed');

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'rescheduled', 'Reprogramación estándar',
  'Hola {nombre}, tu cita de {servicio} quedó reprogramada para el {fecha} a las {hora} con {barbero} en {sucursal}. Si no te sirve el horario, avisanos y lo ajustamos.',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'rescheduled');

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'reminder', 'Recordatorio estándar',
  '¡Hola {nombre}! Te recordamos tu cita de {servicio} mañana {fecha} a las {hora} con {barbero} en {sucursal}. Si no llegás, avisanos con 2 horas de anticipación. ¡Nos vemos!',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'reminder');

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'thanks', 'Agradecimiento estándar',
  '¡Gracias por tu visita, {nombre}! Esperamos que disfrutes tu {servicio}. Cuando quieras repetir, reservá en un toque desde la web. 💈',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'thanks');

-- =============================================================
-- 023 — Chat que aprende: logs de conversaciones + base de
-- conocimiento auto-aprendida con guardrails (FASE 31 polish).
-- =============================================================

CREATE TABLE IF NOT EXISTS chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode TEXT NOT NULL CHECK (mode IN ('client','admin')),
    question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    answer TEXT,
    provider TEXT NOT NULL CHECK (provider IN ('gemini','openai','rules')),
    was_fallback BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs (created_at DESC);

ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view chat logs" ON chat_logs;
CREATE POLICY "Admins view chat logs" ON chat_logs
  FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "Admins delete chat logs" ON chat_logs;
CREATE POLICY "Admins delete chat logs" ON chat_logs
  FOR DELETE USING (is_admin());

CREATE TABLE IF NOT EXISTS chat_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_knowledge_normalized ON chat_knowledge (normalized_question);

ALTER TABLE chat_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active chat knowledge" ON chat_knowledge;
CREATE POLICY "Public read active chat knowledge" ON chat_knowledge
  FOR SELECT USING (is_active = true OR is_admin());
DROP POLICY IF EXISTS "Admins manage chat knowledge" ON chat_knowledge;
CREATE POLICY "Admins manage chat knowledge" ON chat_knowledge
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION log_chat_message(
  p_mode TEXT,
  p_question TEXT,
  p_answer TEXT,
  p_provider TEXT,
  p_was_fallback BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question TEXT;
  v_answer TEXT;
BEGIN
  IF p_mode NOT IN ('client', 'admin') THEN RETURN; END IF;
  IF p_provider NOT IN ('gemini', 'openai', 'rules') THEN RETURN; END IF;
  IF p_question IS NULL OR length(trim(p_question)) = 0 THEN RETURN; END IF;

  v_question := left(p_question, 500);
  v_answer := CASE WHEN p_answer IS NULL THEN NULL ELSE left(p_answer, 4000) END;

  INSERT INTO chat_logs (mode, question, normalized_question, answer, provider, was_fallback)
  VALUES (
    p_mode,
    v_question,
    lower(translate(v_question,
      'áéíóúÁÉÍÓÚñÑüÜ',
      'aeiouAEIOUnNuU'
    )),
    v_answer,
    p_provider,
    COALESCE(p_was_fallback, false)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION log_chat_message(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_chat_message(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION learn_chat_knowledge(
  p_question TEXT,
  p_answer TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question TEXT;
  v_answer TEXT;
  v_normalized TEXT;
  v_auto_count INT;
BEGIN
  IF p_question IS NULL OR length(trim(p_question)) = 0 THEN RETURN; END IF;
  IF p_answer IS NULL OR length(trim(p_answer)) = 0 THEN RETURN; END IF;

  v_question := left(p_question, 300);
  v_answer := left(p_answer, 1000);
  v_normalized := lower(translate(v_question,
    'áéíóúÁÉÍÓÚñÑüÜ',
    'aeiouAEIOUnNuU'
  ));

  SELECT count(*) INTO v_auto_count FROM chat_knowledge WHERE source = 'auto';
  IF v_auto_count >= 200 THEN RETURN; END IF;

  INSERT INTO chat_knowledge (question, normalized_question, answer, source)
  VALUES (v_question, v_normalized, v_answer, 'auto')
  ON CONFLICT (normalized_question) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION learn_chat_knowledge(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION learn_chat_knowledge(TEXT, TEXT) TO anon, authenticated;

INSERT INTO app_settings (key, value, description) VALUES
  ('feature.chat_aprendizaje', 'true'::jsonb, 'Auto-aprendizaje del asistente IA (base de conocimiento)')
ON CONFLICT (key) DO NOTHING;

-- =============================================================
-- 024 — CRM: segmentación de clientes + cumpleaños (FASE 33 polish).
-- profiles.birth_date y get_clients_overview_page (p_sort/p_segment) ya
-- espejados arriba, junto a la función original. Acá solo el evento
-- 'birthday' de message_templates (con guard de existencia).
-- =============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'message_templates'
  ) THEN
    EXECUTE 'ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_event_type_check';
    EXECUTE $ct$
      ALTER TABLE message_templates ADD CONSTRAINT message_templates_event_type_check
        CHECK (event_type IN ('cancelled', 'confirmed', 'rescheduled', 'reminder', 'thanks', 'birthday'))
    $ct$;

    EXECUTE $ins$
      INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
      SELECT 'birthday', 'Cumpleaños estándar',
        '¡Feliz cumpleaños, {nombre}! 🎉 De regalo, te esperamos en NB Barber para que arranques tu año con el mejor look. Reservá tu turno cuando quieras.',
        true, 0
      WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'birthday')
    $ins$;
  END IF;
END $$;

-- Nota: no hace falta una RPC admin_update_client_birth_date — la policy
-- "Admins update profiles" (FOR UPDATE USING (is_admin())) ya permite que
-- el admin actualice birth_date de cualquier perfil directamente vía
-- supabase.from('profiles').update(...), igual que hace hoy con notes.
