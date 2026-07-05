-- =====================================================
-- DATOS ADICIONALES - LOOKBOOK
-- Ejecutar en Supabase > SQL Editor
-- =====================================================

-- Limpiar lookbook existente e insertar nuevos estilos
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
