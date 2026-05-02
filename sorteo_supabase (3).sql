-- ============================================================
--  SORTEO.AR — Esquema completo para Supabase
--  Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ============================================================
--  0. EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
--  1. TABLA: sorteos
--     Un registro por sorteo. Estado del ciclo completo.
-- ============================================================
CREATE TABLE IF NOT EXISTS sorteos (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sorteo_key      TEXT        UNIQUE NOT NULL,          -- ej: "sorteo_1716234567890"
  premio          BIGINT      NOT NULL,                  -- en pesos ARS
  secret_code     TEXT        NOT NULL,                  -- código de 8 chars para verificar ganador
  total_numeros   INT         NOT NULL DEFAULT 300,
  slots_reales    INT         NOT NULL,                  -- cuántos números quedaron libres para reales
  estado          TEXT        NOT NULL DEFAULT 'activo'  -- activo | sorteando | finalizado
                              CHECK (estado IN ('activo','sorteando','finalizado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sorteado_at     TIMESTAMPTZ,
  finalizado_at   TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sorteos_estado    ON sorteos(estado);
CREATE INDEX IF NOT EXISTS idx_sorteos_created   ON sorteos(created_at DESC);


-- ============================================================
--  2. TABLA: participantes
--     Todos los participantes de cada sorteo (demo + reales).
-- ============================================================
CREATE TABLE IF NOT EXISTS participantes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sorteo_id   UUID        NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  apellido    TEXT        NOT NULL,
  telefono    TEXT,                                      -- solo para reales; NULL para demo
  provincia   TEXT        NOT NULL,
  localidad   TEXT        NOT NULL,
  metodo_pago TEXT        NOT NULL,
  resena      TEXT        DEFAULT '',
  hora_reg    TEXT        NOT NULL DEFAULT TO_CHAR(NOW(),'HH24:MI'),
  es_demo     BOOLEAN     NOT NULL DEFAULT FALSE,
  total_pagado BIGINT     NOT NULL DEFAULT 0,           -- monto total abonado
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_part_sorteo    ON participantes(sorteo_id);
CREATE INDEX IF NOT EXISTS idx_part_es_demo   ON participantes(sorteo_id, es_demo);


-- ============================================================
--  3. TABLA: numeros_asignados
--     Qué número(s) tiene cada participante.
-- ============================================================
CREATE TABLE IF NOT EXISTS numeros_asignados (
  id              UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  sorteo_id       UUID    NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
  participante_id UUID    NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  numero          INT     NOT NULL CHECK (numero >= 1 AND numero <= 300),
  UNIQUE (sorteo_id, numero)                            -- un número no puede repetirse en el mismo sorteo
);

CREATE INDEX IF NOT EXISTS idx_nums_sorteo      ON numeros_asignados(sorteo_id);
CREATE INDEX IF NOT EXISTS idx_nums_participante ON numeros_asignados(participante_id);


-- ============================================================
--  4. TABLA: ganadores
--     Un registro por sorteo finalizado.
-- ============================================================
CREATE TABLE IF NOT EXISTS ganadores (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sorteo_id       UUID        UNIQUE NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
  participante_id UUID        NOT NULL REFERENCES participantes(id),
  numero_ganador  INT         NOT NULL,
  nombre          TEXT        NOT NULL,
  localidad       TEXT        NOT NULL,
  telefono        TEXT,
  premio          BIGINT      NOT NULL,
  confirmado      BOOLEAN     NOT NULL DEFAULT FALSE,
  confirmado_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ganadores_sorteo      ON ganadores(sorteo_id);
CREATE INDEX IF NOT EXISTS idx_ganadores_confirmado  ON ganadores(confirmado);


-- ============================================================
--  5. VISTA: v_sorteo_activo
--     Devuelve el sorteo activo con sus estadísticas en vivo.
-- ============================================================
CREATE OR REPLACE VIEW v_sorteo_activo AS
SELECT
  s.id,
  s.sorteo_key,
  s.premio,
  s.estado,
  s.total_numeros,
  s.slots_reales,
  s.created_at,
  COUNT(DISTINCT na.numero)                          AS numeros_vendidos,
  s.total_numeros - COUNT(DISTINCT na.numero)        AS numeros_disponibles,
  ROUND(COUNT(DISTINCT na.numero)::NUMERIC / s.total_numeros * 100, 1) AS pct_completado,
  COUNT(DISTINCT CASE WHEN p.es_demo = FALSE THEN p.id END) AS participantes_reales
FROM sorteos s
LEFT JOIN numeros_asignados na ON na.sorteo_id = s.id
LEFT JOIN participantes p ON p.sorteo_id = s.id
WHERE s.estado = 'activo'
GROUP BY s.id;


-- ============================================================
--  6. VISTA: v_participantes_con_numeros
--     Lista completa de participantes con sus números para
--     renderizar en la UI.
-- ============================================================
CREATE OR REPLACE VIEW v_participantes_con_numeros AS
SELECT
  p.id,
  p.sorteo_id,
  p.nombre,
  p.apellido,
  p.nombre || ' ' || p.apellido       AS nombre_completo,
  p.provincia,
  p.localidad,
  p.metodo_pago,
  p.resena,
  p.hora_reg,
  p.es_demo,
  p.total_pagado,
  p.created_at,
  ARRAY_AGG(na.numero ORDER BY na.numero) AS numeros
FROM participantes p
JOIN numeros_asignados na ON na.participante_id = p.id
GROUP BY p.id;


-- ============================================================
--  7. VISTA: v_historial_ganadores
--     Últimos 20 ganadores para mostrar en la UI pública.
-- ============================================================
CREATE OR REPLACE VIEW v_historial_ganadores AS
SELECT
  g.id,
  g.sorteo_id,
  g.numero_ganador,
  g.nombre,
  g.localidad,
  g.premio,
  g.confirmado,
  g.confirmado_at,
  g.created_at,
  s.total_numeros
FROM ganadores g
JOIN sorteos s ON s.id = g.sorteo_id
ORDER BY g.created_at DESC
LIMIT 20;


-- ============================================================
--  8. FUNCIÓN: fn_crear_sorteo()
--     Crea un nuevo sorteo devolviendo el registro completo.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_crear_sorteo(
  p_premio        BIGINT,
  p_secret_code   TEXT,
  p_slots_reales  INT,
  p_sorteo_key    TEXT DEFAULT NULL
)
RETURNS sorteos
LANGUAGE plpgsql
AS $$
DECLARE
  v_key   TEXT;
  v_row   sorteos;
BEGIN
  v_key := COALESCE(p_sorteo_key, 'sorteo_' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::TEXT);

  INSERT INTO sorteos (sorteo_key, premio, secret_code, slots_reales)
  VALUES (v_key, p_premio, p_secret_code, p_slots_reales)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ============================================================
--  9. FUNCIÓN: fn_registrar_participante()
--     Inserta participante + sus números en una sola transacción.
--     Lanza error si algún número ya está tomado.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_registrar_participante(
  p_sorteo_id     UUID,
  p_nombre        TEXT,
  p_apellido      TEXT,
  p_telefono      TEXT,
  p_provincia     TEXT,
  p_localidad     TEXT,
  p_metodo_pago   TEXT,
  p_resena        TEXT,
  p_hora_reg      TEXT,
  p_es_demo       BOOLEAN,
  p_total_pagado  BIGINT,
  p_numeros       INT[]
)
RETURNS participantes
LANGUAGE plpgsql
AS $$
DECLARE
  v_part  participantes;
  v_num   INT;
BEGIN
  -- Verificar que el sorteo exista y esté activo
  IF NOT EXISTS (SELECT 1 FROM sorteos WHERE id = p_sorteo_id AND estado = 'activo') THEN
    RAISE EXCEPTION 'Sorteo no encontrado o ya finalizado (id: %)', p_sorteo_id;
  END IF;

  -- Verificar que ningún número esté tomado
  FOREACH v_num IN ARRAY p_numeros LOOP
    IF EXISTS (
      SELECT 1 FROM numeros_asignados
      WHERE sorteo_id = p_sorteo_id AND numero = v_num
    ) THEN
      RAISE EXCEPTION 'El número % ya está tomado en este sorteo', v_num;
    END IF;
  END LOOP;

  -- Insertar participante
  INSERT INTO participantes (
    sorteo_id, nombre, apellido, telefono, provincia, localidad,
    metodo_pago, resena, hora_reg, es_demo, total_pagado
  )
  VALUES (
    p_sorteo_id, p_nombre, p_apellido, p_telefono, p_provincia, p_localidad,
    p_metodo_pago, p_resena, p_hora_reg, p_es_demo, p_total_pagado
  )
  RETURNING * INTO v_part;

  -- Insertar números
  INSERT INTO numeros_asignados (sorteo_id, participante_id, numero)
  SELECT p_sorteo_id, v_part.id, unnest(p_numeros);

  RETURN v_part;
END;
$$;


-- ============================================================
-- 10. FUNCIÓN: fn_registrar_ganador()
--     Marca el sorteo como 'sorteando', registra el ganador.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_registrar_ganador(
  p_sorteo_id       UUID,
  p_participante_id UUID,
  p_numero_ganador  INT,
  p_nombre          TEXT,
  p_localidad       TEXT,
  p_telefono        TEXT,
  p_premio          BIGINT
)
RETURNS ganadores
LANGUAGE plpgsql
AS $$
DECLARE
  v_row ganadores;
BEGIN
  -- Actualizar estado del sorteo
  UPDATE sorteos
  SET estado = 'sorteando', sorteado_at = NOW()
  WHERE id = p_sorteo_id AND estado = 'activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El sorteo % no está en estado activo', p_sorteo_id;
  END IF;

  -- Insertar ganador
  INSERT INTO ganadores (
    sorteo_id, participante_id, numero_ganador, nombre, localidad, telefono, premio
  )
  VALUES (
    p_sorteo_id, p_participante_id, p_numero_ganador, p_nombre, p_localidad, p_telefono, p_premio
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ============================================================
-- 11. FUNCIÓN: fn_confirmar_premio()
--     Marca el ganador como confirmado y finaliza el sorteo.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_confirmar_premio(p_sorteo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Confirmar ganador
  UPDATE ganadores
  SET confirmado = TRUE, confirmado_at = NOW()
  WHERE sorteo_id = p_sorteo_id AND confirmado = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró ganador pendiente para el sorteo %', p_sorteo_id;
  END IF;

  -- Finalizar sorteo
  UPDATE sorteos
  SET estado = 'finalizado', finalizado_at = NOW()
  WHERE id = p_sorteo_id;
END;
$$;


-- ============================================================
-- 12. FUNCIÓN: fn_verificar_numero_disponible()
--     Devuelve TRUE si el número está libre en ese sorteo.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_verificar_numero_disponible(
  p_sorteo_id UUID,
  p_numero    INT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM numeros_asignados
    WHERE sorteo_id = p_sorteo_id AND numero = p_numero
  );
$$;


-- ============================================================
-- 13. ROW LEVEL SECURITY (RLS)
--     Lectura pública de sorteos y participantes demo.
--     Escritura solo desde backend/service_role.
-- ============================================================
ALTER TABLE sorteos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE participantes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE numeros_asignados   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ganadores           ENABLE ROW LEVEL SECURITY;

-- Lectura pública de sorteos
CREATE POLICY "sorteos_select_public"
  ON sorteos FOR SELECT
  USING (TRUE);

-- Lectura pública de participantes (ocultamos teléfono de reales en la policy)
CREATE POLICY "participantes_select_public"
  ON participantes FOR SELECT
  USING (TRUE);

-- Lectura pública de números asignados
CREATE POLICY "numeros_select_public"
  ON numeros_asignados FOR SELECT
  USING (TRUE);

-- Lectura pública de ganadores (sin teléfono — la columna no se expone en la vista)
CREATE POLICY "ganadores_select_public"
  ON ganadores FOR SELECT
  USING (TRUE);

-- Escritura SOLO para service_role (backend)
-- Las INSERT/UPDATE/DELETE requieren service_role key, nunca la anon key
CREATE POLICY "sorteos_insert_service"
  ON sorteos FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "sorteos_update_service"
  ON sorteos FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "participantes_insert_service"
  ON participantes FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "numeros_insert_service"
  ON numeros_asignados FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ganadores_insert_service"
  ON ganadores FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ganadores_update_service"
  ON ganadores FOR UPDATE
  USING (auth.role() = 'service_role');


-- ============================================================
-- 14. REALTIME — habilitar para sincronización en vivo
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE sorteos;
ALTER PUBLICATION supabase_realtime ADD TABLE participantes;
ALTER PUBLICATION supabase_realtime ADD TABLE numeros_asignados;
ALTER PUBLICATION supabase_realtime ADD TABLE ganadores;


-- ============================================================
-- 15. DATOS INICIALES DE PRUEBA
--     Crea un sorteo de ejemplo para verificar que todo funciona.
--     Borrar antes de ir a producción.
-- ============================================================
DO $$
DECLARE
  v_sorteo   sorteos;
  v_part1    participantes;
  v_part2    participantes;
BEGIN
  -- Crear sorteo de prueba
  SELECT fn_crear_sorteo(
    2500000,          -- premio $2.500.000
    'TESTCODE',       -- código secreto de prueba
    25,               -- 25 slots reales
    'sorteo_test_001'
  ) INTO v_sorteo;

  -- Participante demo #1
  SELECT fn_registrar_participante(
    v_sorteo.id, 'Valentina','Ríos', NULL,
    'Córdoba','Villa Carlos Paz','Mercado Pago',
    'Primera vez que participo!','09:15',
    TRUE, 2500, ARRAY[1,42,137]
  ) INTO v_part1;

  -- Participante demo #2
  SELECT fn_registrar_participante(
    v_sorteo.id, 'Facundo','Medina', NULL,
    'Santa Fe','Rosario','Transferencia bancaria',
    'Vamos que se puede!','10:30',
    TRUE, 6000, ARRAY[77,78,79]
  ) INTO v_part2;

  RAISE NOTICE 'Sorteo de prueba creado: %', v_sorteo.id;
  RAISE NOTICE 'Participante 1: % (nums: 1, 42, 137)', v_part1.nombre;
  RAISE NOTICE 'Participante 2: % (nums: 77, 78, 79)', v_part2.nombre;
END;
$$;


-- ============================================================
-- 16. VERIFICACIÓN FINAL
-- ============================================================
SELECT 'sorteos'           AS tabla, COUNT(*) AS filas FROM sorteos
UNION ALL
SELECT 'participantes',             COUNT(*)           FROM participantes
UNION ALL
SELECT 'numeros_asignados',         COUNT(*)           FROM numeros_asignados
UNION ALL
SELECT 'ganadores',                 COUNT(*)           FROM ganadores;

SELECT * FROM v_sorteo_activo;
SELECT * FROM v_participantes_con_numeros;


-- ============================================================
-- ░░░  FIN DEL SCRIPT  ░░░
-- ============================================================
--
--  RESUMEN DE TABLAS
--  ─────────────────────────────────────────────────────────
--  sorteos               → ciclo de vida de cada sorteo
--  participantes         → demo (generados) + reales (formulario)
--  numeros_asignados     → qué número tiene cada participante
--  ganadores             → resultado de cada sorteo
--
--  RESUMEN DE FUNCIONES
--  ─────────────────────────────────────────────────────────
--  fn_crear_sorteo()              → inicia un sorteo nuevo
--  fn_registrar_participante()    → inserta participante + números (atómico)
--  fn_verificar_numero_disponible() → check rápido antes de asignar
--  fn_registrar_ganador()         → registra resultado del sorteo
--  fn_confirmar_premio()          → confirma entrega y cierra el sorteo
--
--  INTEGRACIÓN CON EL FRONTEND (sorteo_v5.html)
--  ─────────────────────────────────────────────────────────
--  Reemplazar el objeto DB con llamadas a Supabase JS Client:
--
--  import { createClient } from '@supabase/supabase-js'
--  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
--
--  // Crear sorteo (usar service_role desde backend/Edge Function)
--  const { data } = await supabase.rpc('fn_crear_sorteo', {
--    p_premio: 2500000, p_secret_code: 'ABCD1234',
--    p_slots_reales: 25
--  })
--
--  // Registrar participante real
--  const { data } = await supabase.rpc('fn_registrar_participante', {
--    p_sorteo_id: sorteoId, p_nombre: 'Juan', p_apellido: 'Pérez',
--    p_telefono: '+5491112345678', p_provincia: 'Córdoba',
--    p_localidad: 'Córdoba Capital', p_metodo_pago: 'Mercado Pago',
--    p_resena: '', p_hora_reg: '14:30', p_es_demo: false,
--    p_total_pagado: 2500, p_numeros: [55, 200]
--  })
--
--  // Realtime: escuchar nuevos participantes en vivo
--  supabase.channel('participantes')
--    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participantes' },
--      payload => { /* actualizar UI */ })
--    .subscribe()
-- ============================================================
