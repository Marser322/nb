-- =====================================================
-- DATOS ADICIONALES - LOOKBOOK
-- Ejecutar en Supabase > SQL Editor
-- =====================================================

-- Limpiar lookbook existente e insertar nuevos estilos
DELETE FROM lookbook;

INSERT INTO lookbook (title, image_url, tags, is_featured, instagram_url) VALUES
    ('Fade Clásico', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600', ARRAY['fade', 'clásico', 'elegante'], true, 'https://instagram.com/nbbarber'),
    ('Buzz Cut Moderno', 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600', ARRAY['corto', 'moderno', 'militar'], true, NULL),
    ('Pompadour Retro', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600', ARRAY['pompadour', 'volumen', 'retro'], true, 'https://instagram.com/nbbarber'),
    ('Undercut Texturizado', 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600', ARRAY['undercut', 'textura', 'moderno'], false, NULL),
    ('Barba Perfecta', 'https://images.unsplash.com/photo-1621607505837-03c14c6dd51e?w=600', ARRAY['barba', 'perfilado', 'cuidado'], true, 'https://instagram.com/nbbarber'),
    ('Corte Ejecutivo', 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600', ARRAY['ejecutivo', 'formal', 'clásico'], false, NULL),
    ('Degradado Alto', 'https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?w=600', ARRAY['degradado', 'fade', 'alto'], false, NULL),
    ('Estilo Urbano', 'https://images.unsplash.com/photo-1534297635766-a262cdcb8ee4?w=600', ARRAY['urbano', 'moderno', 'juvenil'], true, 'https://instagram.com/nbbarber');
