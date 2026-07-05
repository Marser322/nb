-- =====================================================
-- NB BARBER - SCRIPT MAESTRO DE INSTALACIÓN
-- Copia todo este contenido y pégalo en Supabase > SQL Editor
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
    ('Carlos', 'Especialista en cortes clásicos y modernos', '/images/barbers/carlos.png', true),
    ('Miguel', 'Experto en diseño de barba y estilos urbanos', '/images/barbers/miguel.png', true),
    ('Diego', 'Barbero con 10 años de experiencia', '/images/barbers/diego.png', true);

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
    ('Fade Degradado Alto', '/lookbook/fade-cut.png', ARRAY['corte', 'fade', 'moderno'], true, 'https://instagram.com/newbrothers.uy'),
    ('Perfilado de Barba', '/lookbook/beard-trim.png', ARRAY['barba', 'grooming', 'tijera'], true, 'https://instagram.com/newbrothers.uy'),
    ('Afeitado Hot Towel', '/lookbook/hot-towel.png', ARRAY['afeitado', 'spa', 'clásico'], true, NULL),
    ('Styling Texturizado', '/lookbook/styling-pomade.png', ARRAY['styling', 'producto', 'textura'], false, NULL),
    ('Instrumentos de Precisión', '/lookbook/clipper-detail.png', ARRAY['herramientas', 'calidad'], false, NULL),
    ('Corte a Tijera', '/lookbook/scissor-cut.png', ARRAY['corte', 'tijera', 'clásico'], false, NULL),
    ('Ambiente Industrial', '/lookbook/barber-chair.png', ARRAY['local', 'ambiente'], false, NULL),
    ('Lavado Premium', '/lookbook/hair-wash.png', ARRAY['servicio', 'relax'], false, NULL);

-- ¡LISTO! Todo configurado.
