-- =====================================================
-- MIGRACIÓN 005: CHECKOUT TRANSACCIONAL
-- Ejecutar en Supabase > SQL Editor
-- =====================================================

-- Crea la orden, sus items y descuenta el stock en UNA sola transacción.
-- Reemplaza la secuencia desde el cliente (orders → order_items → decrement_stock)
-- que podía dejar órdenes confirmadas sin stock descontado si un paso fallaba.
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
  -- Resolver el perfil del usuario autenticado. Tolera ambas variantes de schema:
  -- profiles.auth_user_id = auth.uid() (trigger de 001) o profiles.id = auth.uid()
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
