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
