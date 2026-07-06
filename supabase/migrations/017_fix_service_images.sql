-- =====================================================
-- MIGRACIÓN 017: CORRIGE EXTENSIÓN DE image_url EN SERVICES
-- =====================================================
-- El seed original insertó rutas con extensión .png, pero los archivos
-- reales en public/images/hero/ son .jpg. Esto causaba 404 en el preview
-- del paso 2 del wizard de reserva.

UPDATE services
SET image_url = replace(image_url, '.png', '.jpg')
WHERE image_url LIKE '/images/hero/%.png';
