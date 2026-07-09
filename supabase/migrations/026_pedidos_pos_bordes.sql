-- =============================================================
-- 026 — Pedidos y POS: bordes reales del mostrador (polish FASE 35).
-- Ejecutar a mano en el SQL Editor de Supabase, DESPUÉS de la 025
-- (asume que idx_cash_movements_void_once y void_cash_movement ya existen).
-- Idempotente: se puede correr N veces sin duplicar ni romper nada.
-- =============================================================

-- 1) update_order_status: reversa contable al cancelar una orden que ya
-- estaba cobrada (online 'paid', o cualquier venta de mostrador — nace
-- 'paid' via create_counter_sale). El ingreso original vive en cash_movements
-- con reference_id = orders.id y category='product' (ver create_counter_sale
-- y el bloque 'paid' de este mismo trigger para online). Si la orden nunca
-- se cobró (pending -> cancelled), no hay ingreso que revertir.
--
-- Cambia el tipo de retorno de VOID a JSONB para poder avisar a la UI cuando
-- el restock se omitió por falta de branch_id (RAISE WARNING + flag), y si
-- hubo o no reversa de caja. Requiere DROP porque Postgres no permite
-- cambiar el tipo de retorno con CREATE OR REPLACE.
DROP FUNCTION IF EXISTS update_order_status(UUID, order_status);

CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_new_status order_status
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_cash_method TEXT;
  v_income RECORD;
  v_restock_skipped BOOLEAN := FALSE;
  v_reversed BOOLEAN := FALSE;
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
    RETURN jsonb_build_object('restock_skipped', FALSE, 'reversed', FALSE);
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

  IF p_new_status = 'cancelled' THEN
    IF v_order.branch_id IS NOT NULL THEN
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
    ELSE
      -- Orden sin sucursal (legacy, previa al multi-sucursal): no hay a qué
      -- product_stock devolver el stock. Antes esto se saltaba en silencio;
      -- ahora se avisa explícitamente (WARNING en el log + flag para la UI).
      RAISE WARNING 'update_order_status: orden % cancelada sin branch_id, restock omitido', p_order_id;
      v_restock_skipped := TRUE;
    END IF;
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

  -- Reversa de caja al cancelar una orden que ya estaba cobrada. El ingreso
  -- original (si existe) es siempre 'income'/'product'/reference_id=orden,
  -- tanto para POS (create_counter_sale) como para online marcada 'paid'
  -- arriba. Si nunca se cobró (pending -> cancelled) no hay nada que revertir.
  IF p_new_status = 'cancelled' THEN
    SELECT * INTO v_income
    FROM cash_movements
    WHERE reference_id = v_order.id AND category = 'product' AND type = 'income'
    LIMIT 1;

    IF FOUND THEN
      BEGIN
        INSERT INTO cash_movements (
          type, category, amount, payment_method, description, reference_id,
          branch_id, created_by
        )
        VALUES (
          'expense', 'adjustment', v_income.amount, v_income.payment_method,
          'Reversa por cancelación de pedido', v_order.id, v_income.branch_id, auth.uid()
        );
        v_reversed := TRUE;
      EXCEPTION WHEN unique_violation THEN
        -- idx_cash_movements_void_once (creado en la 025) ya tiene una
        -- reversa para este reference_id: no duplicar, no romper el flujo.
        v_reversed := TRUE;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('restock_skipped', v_restock_skipped, 'reversed', v_reversed);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_order_status(UUID, order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_order_status(UUID, order_status) TO authenticated;

-- 2) void_cash_movement: guard anti-doble-reversa. Un ingreso de pedido
-- (category='product', siempre con reference_id = orders.id) se revierte
-- SOLO cancelando el pedido desde /admin/pedidos (bloque de arriba). Si se
-- permitiera anularlo también a mano desde Caja, un pedido cobrado y luego
-- cancelado terminaría con dos contra-asientos para el mismo ingreso.
-- Reutiliza idx_cash_movements_void_once (025); no crea índices nuevos.
CREATE OR REPLACE FUNCTION void_cash_movement(
  p_movement_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mov RECORD;
  v_new_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_mov FROM cash_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOVIMIENTO_NO_EXISTE';
  END IF;

  IF v_mov.appointment_id IS NOT NULL THEN
    RAISE EXCEPTION 'MOVIMIENTO_DE_CITA';
  END IF;

  IF v_mov.category = 'product' AND v_mov.reference_id IS NOT NULL THEN
    RAISE EXCEPTION 'MOVIMIENTO_DE_PEDIDO';
  END IF;

  IF v_mov.category = 'settlement' OR EXISTS (
    SELECT 1 FROM barber_settlements WHERE payout_movement_id = p_movement_id
  ) THEN
    RAISE EXCEPTION 'MOVIMIENTO_DE_LIQUIDACION';
  END IF;

  -- Ya es en sí mismo un contra-asiento de otro movimiento: no se puede re-anular.
  IF v_mov.category = 'adjustment' AND v_mov.reference_id IS NOT NULL THEN
    RAISE EXCEPTION 'YA_ANULADO';
  END IF;

  -- Ya tiene un contra-asiento propio (chequeo explícito; el índice único de
  -- abajo es el que hace esto race-safe ante dos anulaciones concurrentes).
  IF EXISTS (
    SELECT 1 FROM cash_movements WHERE reference_id = p_movement_id AND category = 'adjustment'
  ) THEN
    RAISE EXCEPTION 'YA_ANULADO';
  END IF;

  BEGIN
    INSERT INTO cash_movements (type, category, amount, payment_method, description,
      barber_id, branch_id, reference_id, created_by)
    VALUES (
      CASE v_mov.type WHEN 'income' THEN 'expense' ELSE 'income' END,
      'adjustment', v_mov.amount, v_mov.payment_method,
      'Anulación: ' || COALESCE(NULLIF(BTRIM(p_reason), ''), v_mov.description, 'sin descripción'),
      v_mov.barber_id, v_mov.branch_id, p_movement_id, auth.uid()
    )
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'YA_ANULADO';
  END;

  RETURN v_new_id;
END; $$;

REVOKE EXECUTE ON FUNCTION void_cash_movement(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_cash_movement(UUID, TEXT) TO authenticated;
