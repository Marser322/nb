-- =====================================================
-- DATOS DE PRUEBA - NB BARBER
-- Ejecutar después del esquema principal
-- =====================================================

-- Insertar barberos de ejemplo
INSERT INTO barbers (name, bio, avatar_url, is_active) VALUES
    ('Carlos', 'Especialista en cortes clásicos y modernos', '/images/barbers/carlos.png', true),
    ('Miguel', 'Experto en diseño de barba y estilos urbanos', '/images/barbers/miguel.png', true),
    ('Diego', 'Barbero con 10 años de experiencia', '/images/barbers/diego.png', true);

-- Insertar productos de ejemplo
INSERT INTO products (name, description, price, stock, category, image_url, is_active) VALUES
    ('NB Matte Clay', 'Fijación fuerte, acabado mate natural', 750, 20, 'Styling', '/products/matte-clay.png', true),
    ('Beard Elixir - Sandalwood', 'Hidratación y brillo para tu barba', 600, 15, 'Barba', '/products/beard-elixir.png', true),
    ('Classic Pomade', 'Fijación media con brillo elegante', 550, 18, 'Styling', '/products/classic-pomade.png', true),
    ('Carbon Daily Shampoo', 'Limpieza profunda sin resecar el cabello', 450, 25, 'Cabello', '/products/shampoo.png', true),
    ('Post-Shave Cooling Balm', 'Suavidad y calma después del afeitado', 500, 12, 'Afeitado', '/products/cooling-balm.png', true);

-- Insertar estilos de lookbook
INSERT INTO lookbook (title, image_url, tags, is_featured) VALUES
    ('Fade Degradado Alto', '/lookbook/fade-cut.png', ARRAY['corte', 'fade', 'moderno'], true),
    ('Perfilado de Barba', '/lookbook/beard-trim.png', ARRAY['barba', 'grooming', 'tijera'], true),
    ('Styling Texturizado', '/lookbook/styling-pomade.png', ARRAY['styling', 'producto', 'textura'], true);
