-- =====================================================
-- MIGRACION 019: BACKEND DE TIENDA
-- Stock por sucursal, pedidos online/locales, POS y caja.
-- Ejecutar en Supabase > SQL Editor. Idempotente para DBs existentes.
-- =====================================================

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('online', 'local');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fulfillment_type AS ENUM ('pickup', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type order_type NOT NULL DEFAULT 'online';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment fulfillment_type NOT NULL DEFAULT 'pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_orders_updated_at ON orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS product_stock (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (product_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_product_stock_branch ON product_stock(branch_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_product ON product_stock(product_id);

DROP TRIGGER IF EXISTS set_product_stock_updated_at ON product_stock;
CREATE TRIGGER set_product_stock_updated_at
  BEFORE UPDATE ON product_stock
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION recalculate_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  v_product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;

  UPDATE products
  SET stock = COALESCE((
    SELECT SUM(quantity)
    FROM product_stock
    WHERE product_id = v_product_id
  ), 0)
  WHERE id = v_product_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalculate_product_stock_after_change ON product_stock;
CREATE TRIGGER recalculate_product_stock_after_change
  AFTER INSERT OR UPDATE OR DELETE ON product_stock
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_product_stock();

-- Seed de migracion: en DBs existentes mueve el stock global actual a la primera
-- sucursal activa. Corre una vez por producto/sucursal gracias al ON CONFLICT.
DO $$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT id INTO v_branch_id
  FROM branches
  WHERE is_active = TRUE
  ORDER BY created_at
  LIMIT 1;

  IF v_branch_id IS NOT NULL THEN
    INSERT INTO product_stock (product_id, branch_id, quantity, low_stock_threshold)
    SELECT id, v_branch_id, COALESCE(stock, 0), COALESCE(low_stock_threshold, 5)
    FROM products
    WHERE COALESCE(stock, 0) > 0
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('sale_online', 'sale_local', 'adjustment', 'restock', 'cancel_restock')),
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON stock_movements(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_order_product
  ON cash_movements(reference_id)
  WHERE category = 'product' AND reference_id IS NOT NULL;

ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON product_stock FROM anon;
REVOKE ALL ON stock_movements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON product_stock FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON stock_movements FROM authenticated;
GRANT SELECT ON product_stock TO authenticated;
GRANT SELECT ON stock_movements TO authenticated;

DROP POLICY IF EXISTS "Admins manage product stock" ON product_stock;
CREATE POLICY "Admins manage product stock" ON product_stock
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Staff view branch product stock" ON product_stock;
CREATE POLICY "Staff view branch product stock" ON product_stock
  FOR SELECT USING (
    is_admin()
    OR branch_id IN (SELECT branch_id FROM barbers WHERE id = current_barber_id())
  );

DROP POLICY IF EXISTS "Admins view stock movements" ON stock_movements;
CREATE POLICY "Admins view stock movements" ON stock_movements
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins manage stock movements" ON stock_movements;
CREATE POLICY "Admins manage stock movements" ON stock_movements
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP FUNCTION IF EXISTS create_order_with_items(payment_method, JSONB);

CREATE OR REPLACE FUNCTION create_order_with_items(
  p_payment_method payment_method,
  p_items JSONB,
  p_branch_id UUID,
  p_fulfillment fulfillment_type DEFAULT 'pickup',
  p_contact_name TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_profile RECORD;
  v_order_id UUID;
  v_item RECORD;
  v_product RECORD;
  v_stock INTEGER;
  v_subtotal NUMERIC(10,2) := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT id, full_name, phone INTO v_profile
  FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;

  v_client_id := v_profile.id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CARRITO_VACIO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA';
  END IF;

  IF p_fulfillment = 'delivery' AND NULLIF(BTRIM(COALESCE(p_delivery_address, '')), '') IS NULL THEN
    RAISE EXCEPTION 'DIRECCION_REQUERIDA';
  END IF;

  IF p_fulfillment = 'delivery' AND NULLIF(BTRIM(COALESCE(p_contact_phone, v_profile.phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'TELEFONO_REQUERIDO';
  END IF;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::INT AS quantity
    FROM (
      SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
      FROM jsonb_array_elements(p_items) e
    ) parsed
    GROUP BY product_id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;

    SELECT id, name, price INTO v_product
    FROM products
    WHERE id = v_item.product_id AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE';
    END IF;

    SELECT quantity INTO v_stock
    FROM product_stock
    WHERE product_id = v_item.product_id AND branch_id = p_branch_id
    FOR UPDATE;

    IF v_stock IS NULL OR v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', v_product.name;
    END IF;

    v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
  END LOOP;

  INSERT INTO orders (
    client_id, branch_id, order_type, fulfillment, contact_name, contact_phone,
    delivery_address, notes, subtotal, total, status, payment_method, created_by
  )
  VALUES (
    v_client_id, p_branch_id, 'online', p_fulfillment,
    NULLIF(BTRIM(COALESCE(p_contact_name, v_profile.full_name, '')), ''),
    NULLIF(BTRIM(COALESCE(p_contact_phone, v_profile.phone, '')), ''),
    NULLIF(BTRIM(COALESCE(p_delivery_address, '')), ''),
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    v_subtotal, v_subtotal, 'pending', p_payment_method, auth.uid()
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::INT AS quantity
    FROM (
      SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
      FROM jsonb_array_elements(p_items) e
    ) parsed
    GROUP BY product_id
  LOOP
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT v_order_id, p.id, v_item.quantity, p.price
    FROM products p
    WHERE p.id = v_item.product_id;

    UPDATE product_stock
    SET quantity = quantity - v_item.quantity
    WHERE product_id = v_item.product_id AND branch_id = p_branch_id;

    INSERT INTO stock_movements (product_id, branch_id, delta, reason, reference_id, created_by)
    VALUES (v_item.product_id, p_branch_id, -v_item.quantity, 'sale_online', v_order_id, auth.uid());
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_order_with_items(payment_method, JSONB, UUID, fulfillment_type, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_order_with_items(payment_method, JSONB, UUID, fulfillment_type, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION create_counter_sale(
  p_branch_id UUID,
  p_payment_method payment_method,
  p_items JSONB,
  p_barber_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_barber_id UUID;
  v_is_admin BOOLEAN;
  v_order_id UUID;
  v_item RECORD;
  v_product RECORD;
  v_stock INTEGER;
  v_subtotal NUMERIC(10,2) := 0;
  v_cash_method TEXT;
BEGIN
  v_current_barber_id := current_barber_id();
  v_is_admin := is_admin();

  IF NOT (v_is_admin OR v_current_barber_id IS NOT NULL) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA';
  END IF;

  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM barbers WHERE id = v_current_barber_id AND branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA';
  END IF;

  IF p_barber_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM barbers WHERE id = p_barber_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'BARBERO_INVALIDO';
  END IF;

  IF NOT v_is_admin AND p_barber_id IS NOT NULL AND p_barber_id <> v_current_barber_id THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CARRITO_VACIO';
  END IF;

  v_cash_method := CASE p_payment_method
    WHEN 'efectivo' THEN 'cash'
    WHEN 'transferencia' THEN 'transfer'
    WHEN 'mercadopago' THEN 'transfer'
    ELSE 'other'
  END;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::INT AS quantity
    FROM (
      SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
      FROM jsonb_array_elements(p_items) e
    ) parsed
    GROUP BY product_id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;

    SELECT id, name, price INTO v_product
    FROM products
    WHERE id = v_item.product_id AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE';
    END IF;

    SELECT quantity INTO v_stock
    FROM product_stock
    WHERE product_id = v_item.product_id AND branch_id = p_branch_id
    FOR UPDATE;

    IF v_stock IS NULL OR v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', v_product.name;
    END IF;

    v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
  END LOOP;

  INSERT INTO orders (
    branch_id, order_type, fulfillment, contact_name, notes, subtotal, total,
    status, payment_method, created_by
  )
  VALUES (
    p_branch_id, 'local', 'pickup', 'Venta en local',
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    v_subtotal, v_subtotal, 'paid', p_payment_method, auth.uid()
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::INT AS quantity
    FROM (
      SELECT (e->>'product_id')::UUID AS product_id, (e->>'quantity')::INT AS quantity
      FROM jsonb_array_elements(p_items) e
    ) parsed
    GROUP BY product_id
  LOOP
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT v_order_id, p.id, v_item.quantity, p.price
    FROM products p
    WHERE p.id = v_item.product_id;

    UPDATE product_stock
    SET quantity = quantity - v_item.quantity
    WHERE product_id = v_item.product_id AND branch_id = p_branch_id;

    INSERT INTO stock_movements (product_id, branch_id, delta, reason, reference_id, created_by)
    VALUES (v_item.product_id, p_branch_id, -v_item.quantity, 'sale_local', v_order_id, auth.uid());
  END LOOP;

  INSERT INTO cash_movements (
    type, category, amount, payment_method, description, reference_id,
    branch_id, barber_id, created_by
  )
  VALUES (
    'income', 'product', v_subtotal, v_cash_method, 'Venta de mostrador',
    v_order_id, p_branch_id, COALESCE(p_barber_id, v_current_barber_id), auth.uid()
  )
  ON CONFLICT DO NOTHING;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_counter_sale(UUID, payment_method, JSONB, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_counter_sale(UUID, payment_method, JSONB, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_new_status order_status
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_cash_method TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDEN_NO_ENCONTRADA';
  END IF;

  IF v_order.status = p_new_status THEN
    RETURN;
  END IF;

  IF v_order.status IN ('cancelled', 'delivered') THEN
    RAISE EXCEPTION 'TRANSICION_INVALIDA';
  END IF;

  IF NOT (
    (v_order.status = 'pending' AND p_new_status IN ('paid', 'cancelled'))
    OR (v_order.status = 'paid' AND p_new_status IN ('shipped', 'delivered', 'cancelled'))
    OR (v_order.status = 'shipped' AND p_new_status IN ('delivered', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'TRANSICION_INVALIDA';
  END IF;

  IF p_new_status = 'cancelled' AND v_order.branch_id IS NOT NULL THEN
    FOR v_item IN
      SELECT product_id, quantity
      FROM order_items
      WHERE order_id = p_order_id AND product_id IS NOT NULL
    LOOP
      INSERT INTO product_stock (product_id, branch_id, quantity)
      VALUES (v_item.product_id, v_order.branch_id, v_item.quantity)
      ON CONFLICT (product_id, branch_id)
      DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity;

      INSERT INTO stock_movements (product_id, branch_id, delta, reason, reference_id, created_by)
      VALUES (v_item.product_id, v_order.branch_id, v_item.quantity, 'cancel_restock', p_order_id, auth.uid());
    END LOOP;
  END IF;

  UPDATE orders
  SET status = p_new_status
  WHERE id = p_order_id;

  IF p_new_status = 'paid' AND v_order.order_type = 'online' THEN
    v_cash_method := CASE v_order.payment_method
      WHEN 'efectivo' THEN 'cash'
      WHEN 'transferencia' THEN 'transfer'
      WHEN 'mercadopago' THEN 'transfer'
      ELSE 'other'
    END;

    INSERT INTO cash_movements (
      type, category, amount, payment_method, description, reference_id,
      branch_id, created_by
    )
    SELECT
      'income', 'product', v_order.total, v_cash_method,
      'Cobro de pedido online', v_order.id, v_order.branch_id, auth.uid()
    WHERE NOT EXISTS (
      SELECT 1
      FROM cash_movements
      WHERE reference_id = v_order.id AND category = 'product'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_order_status(UUID, order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_order_status(UUID, order_status) TO authenticated;

CREATE OR REPLACE FUNCTION set_product_stock(
  p_product_id UUID,
  p_branch_id UUID,
  p_new_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_quantity INTEGER := 0;
  v_delta INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'PRODUCTO_NO_ENCONTRADO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'SUCURSAL_INVALIDA';
  END IF;

  SELECT quantity INTO v_old_quantity
  FROM product_stock
  WHERE product_id = p_product_id AND branch_id = p_branch_id
  FOR UPDATE;

  v_old_quantity := COALESCE(v_old_quantity, 0);
  v_delta := p_new_quantity - v_old_quantity;

  INSERT INTO product_stock (product_id, branch_id, quantity)
  VALUES (p_product_id, p_branch_id, p_new_quantity)
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET quantity = EXCLUDED.quantity;

  IF v_delta <> 0 THEN
    INSERT INTO stock_movements (product_id, branch_id, delta, reason, created_by)
    VALUES (p_product_id, p_branch_id, v_delta, 'adjustment', auth.uid());
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_product_stock(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_product_stock(UUID, UUID, INTEGER) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'decrement_stock'
      AND pg_get_function_identity_arguments(p.oid) = 'p_product_id uuid, p_quantity integer'
  ) THEN
    REVOKE ALL ON FUNCTION decrement_stock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
