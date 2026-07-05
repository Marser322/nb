-- =====================================================
-- DATOS ADICIONALES - LOOKBOOK
-- Ejecutar en Supabase > SQL Editor
-- =====================================================

-- Limpiar lookbook existente e insertar nuevos estilos
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
