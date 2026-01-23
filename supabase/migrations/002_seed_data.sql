-- =====================================================
-- DATOS DE PRUEBA - NB BARBER
-- Ejecutar después del esquema principal
-- =====================================================

-- Insertar barberos de ejemplo
INSERT INTO barbers (name, bio, is_active) VALUES
    ('Carlos', 'Especialista en cortes clásicos y modernos', true),
    ('Miguel', 'Experto en diseño de barba y estilos urbanos', true),
    ('Diego', 'Barbero con 10 años de experiencia', true);

-- Insertar productos de ejemplo
INSERT INTO products (name, description, price, stock, category, is_active) VALUES
    ('Cera Mate Premium', 'Fijación fuerte, acabado mate natural', 450, 20, 'Ceras', true),
    ('Aceite para Barba', 'Hidratación y brillo para tu barba', 380, 15, 'Aceites', true),
    ('Pomada Clásica', 'Fijación media con brillo elegante', 420, 18, 'Ceras', true),
    ('Shampoo Anticaspa', 'Limpieza profunda y control de caspa', 350, 25, 'Shampoo', true),
    ('Bálsamo para Barba', 'Suavidad y control para barbas largas', 400, 12, 'Barba', true);

-- Insertar estilos de lookbook
INSERT INTO lookbook (title, image_url, tags, is_featured) VALUES
    ('Fade Clásico', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400', ARRAY['fade', 'clásico', 'elegante'], true),
    ('Buzz Cut', 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400', ARRAY['corto', 'moderno', 'práctico'], true),
    ('Pompadour', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400', ARRAY['pompadour', 'volumen', 'retro'], true);
