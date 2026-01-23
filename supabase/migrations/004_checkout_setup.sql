-- =====================================================
-- MIGRACIÓN 004: CHECKOUT SETUP
-- Ejecutar en Supabase > SQL Editor
-- =====================================================

-- 1. Habilitar inserción de items de orden para usuarios autenticados
-- Esto permite que el cliente guarde detalle de productos comprados
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

-- 2. Función segura para descontar stock
-- SECURITY DEFINER permite que se ejecute con permisos de admin, saltando la restricción de RLS en products
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
