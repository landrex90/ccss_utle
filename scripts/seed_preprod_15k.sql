-- ============================================================
-- SEED: 15,000 registros sintéticos para preprod
-- Simula campañas reales con cascada: Correo → WhatsApp → Voicebot
-- SOLO ejecutar en preprod: dutextncxyurphzwpfro
-- ============================================================

DO $$
DECLARE
  i INTEGER;
  v_r  FLOAT;  -- reusable random

  -- Campaña
  v_campaign_idx  INTEGER;
  v_campaign_date TIMESTAMPTZ;

  -- Escenario de canal
  v_scenario TEXT;
  -- 'pendiente'     → no se ha enviado nada aún
  -- 'correo_espera' → correo enviado, WA aún no (campaña muy reciente)
  -- 'wa_espera'     → correo+WA enviados, llamada aún no (campaña reciente)
  -- 'correo_ok'     → respondió al correo
  -- 'wa_ok'         → respondió al WhatsApp (correo sin respuesta)
  -- 'llamada_ok'    → respondió a la llamada (correo+WA sin respuesta)
  -- 'agotado'       → los 3 canales intentados, sin respuesta

  -- Datos del registro
  v_id_registro    TEXT;
  v_nombre         TEXT;
  v_ap1            TEXT;
  v_ap2            TEXT;
  v_asegurado      TEXT;
  v_ultimos4       TEXT;
  v_num            TEXT;
  v_estado         TEXT;
  v_tipo           TEXT;
  v_especialidad   TEXT;
  v_centro         TEXT;
  v_servicio       TEXT;
  v_procedimiento  TEXT;
  v_tipo_consulta  TEXT;
  v_lateralidad    TEXT;
  v_fecha_cita     TEXT;
  v_hora_cita      TEXT;
  v_canal_completado TEXT;
  v_canal_actual     TEXT;
  v_telefono       TEXT;
  v_correo_email   TEXT;
  v_created_at     TIMESTAMPTZ;
  v_updated_at     TIMESTAMPTZ;

  -- Timestamps canales
  v_correo_enviado_at   TIMESTAMPTZ;
  v_correo_abierto_at   TIMESTAMPTZ;
  v_correo_click_at     TIMESTAMPTZ;
  v_correo_estado       TEXT;

  v_wa_enviado_at    TIMESTAMPTZ;
  v_wa_entregado_at  TIMESTAMPTZ;
  v_wa_leido_at      TIMESTAMPTZ;
  v_wa_respondio_at  TIMESTAMPTZ;
  v_wa_estado        TEXT;

  v_llamada_enviada_at    TIMESTAMPTZ;
  v_llamada_contestada_at TIMESTAMPTZ;
  v_llamada_completada_at TIMESTAMPTZ;
  v_llamada_estado        TEXT;
  v_llamada_intentos      SMALLINT;

  -- Respuesta
  v_paso1          TEXT;
  v_paso2          TEXT;
  v_paso2_int      INTEGER;
  v_paso3          TEXT;
  v_paso4          TEXT;
  v_motivo_retiro  TEXT;
  v_flex           TEXT;
  v_cond_asistir   TEXT;
  v_motivo_asistir TEXT;
  v_contacto       TEXT;
  v_completado     BOOLEAN;
  v_abandono       INTEGER;

  -- ── Catálogos ─────────────────────────────────────────────────────────────
  nombres TEXT[] := ARRAY[
    'Andrés','Carlos','María','José','Ana','Luis','Laura','Sofía','Diego','Valentina',
    'Roberto','Carmen','Miguel','Patricia','Fernando','Silvia','Ricardo','Gabriela','Jorge','Isabel',
    'Eduardo','Rocío','Alejandro','Marcela','Sergio','Adriana','Mauricio','Daniela','Óscar','Verónica',
    'Álvaro','Natalia','Rafael','Claudia','Esteban','Melissa','Marco','Andrea','Gerardo','Stephanie',
    'Humberto','Lorena','Ernesto','Sandra','Alfonso','Rebeca','Víctor','Paola','Antonio','Manuela'
  ];
  apellidos TEXT[] := ARRAY[
    'González','Mora','Jiménez','Rodríguez','Vargas','Castro','Solís','Herrera','Quesada','López',
    'Martínez','Pérez','Sánchez','Ramírez','Torres','Flores','Rojas','Chaves','Salas','Arias',
    'Vega','Ruiz','Alvarado','Campos','Vindas','Bonilla','Méndez','Brenes','Calvo','Picado',
    'Muñoz','Ugalde','Villalobos','Alfaro','Molina','Araya','Badilla','Céspedes','Monge','Esquivel'
  ];
  especialidades TEXT[] := ARRAY[
    'Ortopedia y Traumatología','Cardiología','Medicina Interna','Cirugía General',
    'Oftalmología','Neurología','Gastroenterología','Urología','Ginecología',
    'Dermatología','Otorrinolaringología','Neumología','Endocrinología','Hematología',
    'Reumatología','Nefrología','Oncología','Psiquiatría','Cirugía Abdominal','Cirugía Vascular'
  ];
  centros TEXT[] := ARRAY[
    'Hospital Dr. Rafael Ángel Calderón Guardia',
    'Hospital México',
    'Hospital San Juan de Dios',
    'Hospital Nacional de Niños',
    'Hospital Dr. Enrique Baltodano Briceño',
    'Hospital Dr. Tony Facio Castro',
    'Hospital Dr. Fernando Escalante Pradilla',
    'Hospital Dr. Maximiliano Peralta Jiménez',
    'Hospital de La Anexión',
    'Hospital William Allen Taylor',
    'Hospital San Rafael de Alajuela',
    'Hospital Dr. Carlos Luis Valverde Vega',
    'Hospital de Liberia',
    'Hospital de Puntarenas',
    'Hospital de San Carlos'
  ];
  proc_cirugia TEXT[] := ARRAY[
    'Colecistectomía laparoscópica','Artroscopia de rodilla','Reparación de hernia inguinal',
    'Apendicectomía laparoscópica','Cirugía de catarata','Reemplazo total de rodilla',
    'Reemplazo total de cadera','Corrección de hallux valgus','Amigdalectomía',
    'Septoplastia','Tiroidectomía parcial','Prostatectomía transuretral',
    'Safenectomía','Histerectomía laparoscópica','Reparación de menisco',
    'Fijación de fractura','Descompresión de túnel carpiano','Colostomía'
  ];
  tipos_consulta TEXT[] := ARRAY[
    'Primera vez','Seguimiento','Control','Valoración',
    'Anticoagulados','Oncología','Diabetes','Hipertensión',
    'Geriatría','Post-operatorio','Subagudo'
  ];
  lateralidades TEXT[] := ARRAY['Derecha','Izquierda','Bilateral','No aplica'];
  horas_cita    TEXT[] := ARRAY[
    '07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30',
    '11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30'
  ];
  motivos_retiro TEXT[] := ARRAY[
    'ya_no_deseo_la_atencion','acudi_ccss','acudi_privado',
    'ya_no_necesito','contraindicacion_medica','fallecimiento'
  ];
  motivos_no_asistir TEXT[] := ARRAY[
    'problemas_salud','hospitalizacion','falta_transporte','falta_acompanante',
    'obligaciones','problemas_economicos','fuera_pais','decision_personal','otro_motivo'
  ];
  medios_contacto TEXT[] := ARRAY['llamada','whatsapp','correo','sms','cualquiera'];

  -- Fechas de campaña (lotes reales de envío)
  -- Orden: Correo → WhatsApp (+4-5 días) → Voicebot (+4-5 días)
  campaign_dates TIMESTAMPTZ[] := ARRAY[
    '2025-12-10 08:00:00-06'::TIMESTAMPTZ,  -- 1: Dic 10  (completamente resuelto)
    '2026-01-14 08:00:00-06'::TIMESTAMPTZ,  -- 2: Ene 14  (completamente resuelto)
    '2026-02-10 08:00:00-06'::TIMESTAMPTZ,  -- 3: Feb 10  (completamente resuelto)
    '2026-03-05 08:00:00-06'::TIMESTAMPTZ,  -- 4: Mar 5   (completamente resuelto)
    '2026-04-02 08:00:00-06'::TIMESTAMPTZ,  -- 5: Abr 2   (completamente resuelto)
    '2026-04-30 08:00:00-06'::TIMESTAMPTZ,  -- 6: Abr 30  (completamente resuelto)
    '2026-05-22 08:00:00-06'::TIMESTAMPTZ,  -- 7: May 22  (completamente resuelto)
    '2026-06-05 08:00:00-06'::TIMESTAMPTZ,  -- 8: Jun 5   (correo+WA enviados, llamada en curso)
    '2026-06-12 08:00:00-06'::TIMESTAMPTZ   -- 9: Jun 12  (solo correo enviado, WA pendiente)
  ];

BEGIN
  FOR i IN 1..15000 LOOP

    -- ── Asignar a lote de campaña ──────────────────────────────────────────
    -- Distribución: lotes 1-7 = ~1,400 cada uno (9,800 total)
    --               lote 8 = 2,400 | lote 9 = 1,600 | sin campaña = 1,200
    IF    i <=  1400 THEN v_campaign_idx := 1;
    ELSIF i <=  2800 THEN v_campaign_idx := 2;
    ELSIF i <=  4200 THEN v_campaign_idx := 3;
    ELSIF i <=  5600 THEN v_campaign_idx := 4;
    ELSIF i <=  7000 THEN v_campaign_idx := 5;
    ELSIF i <=  8400 THEN v_campaign_idx := 6;
    ELSIF i <=  9800 THEN v_campaign_idx := 7;
    ELSIF i <= 12200 THEN v_campaign_idx := 8;   -- Jun 5: correo+WA enviados
    ELSIF i <= 13800 THEN v_campaign_idx := 9;   -- Jun 12: solo correo enviado
    ELSE                  v_campaign_idx := 0;   -- sin campaña aún
    END IF;

    v_campaign_date := CASE WHEN v_campaign_idx > 0
                            THEN campaign_dates[v_campaign_idx]
                            ELSE NULL END;

    -- ── Escenario según antigüedad de la campaña ───────────────────────────
    v_r := random();

    IF v_campaign_idx = 0 THEN
      v_scenario := 'pendiente';

    ELSIF v_campaign_idx <= 7 THEN
      -- Lotes resueltos: los 3 canales tuvieron tiempo de completarse
      IF    v_r < 0.11 THEN v_scenario := 'correo_ok';    -- 11% respondió correo
      ELSIF v_r < 0.32 THEN v_scenario := 'wa_ok';        -- 21% respondió WA
      ELSIF v_r < 0.50 THEN v_scenario := 'llamada_ok';   -- 18% respondió llamada
      ELSE                   v_scenario := 'agotado';     -- 50% no respondió ninguno
      END IF;

    ELSIF v_campaign_idx = 8 THEN
      -- Jun 5: correo enviado (~Jun5), WA enviado (~Jun9-10), llamada en curso (~Jun14+)
      IF    v_r < 0.13 THEN v_scenario := 'correo_ok';
      ELSIF v_r < 0.36 THEN v_scenario := 'wa_ok';
      ELSE                   v_scenario := 'wa_espera';   -- WA enviado, llamada no terminó aún
      END IF;

    ELSIF v_campaign_idx = 9 THEN
      -- Jun 12: correo enviado, WA aún no se ha enviado (4-5 días = Jun 16-17)
      IF    v_r < 0.09 THEN v_scenario := 'correo_ok';
      ELSE                   v_scenario := 'correo_espera'; -- esperando turno de WA
      END IF;

    END IF;

    -- ── Estado final del registro ──────────────────────────────────────────
    IF v_scenario IN ('pendiente','correo_espera','wa_espera','agotado') THEN
      v_estado           := 'PENDIENTE';
      v_canal_completado := NULL;
    ELSE
      v_r := random();
      IF    v_r < 0.42 THEN v_estado := 'ACTIVO';
      ELSIF v_r < 0.60 THEN v_estado := 'DEPURADO_RENUNCIA';
      ELSIF v_r < 0.70 THEN v_estado := 'NO_AUTORIZO';
      ELSIF v_r < 0.78 THEN v_estado := 'NO_VERIFICADO';
      ELSIF v_r < 0.85 THEN v_estado := 'INFO_INCORRECTA';
      ELSIF v_r < 0.91 THEN v_estado := 'NO_ASEGURADO';
      ELSIF v_r < 0.96 THEN v_estado := 'DEPURADO_YA_ATENDIDO';
      ELSE                   v_estado := 'DEPURADO_YA_PROGRAMADO';
      END IF;

      v_canal_completado := CASE v_scenario
        WHEN 'correo_ok'   THEN 'correo'
        WHEN 'wa_ok'       THEN 'whatsapp'
        WHEN 'llamada_ok'  THEN 'llamada'
        ELSE NULL
      END;
    END IF;

    -- ── canal_actual (canal en que está parado el proceso) ─────────────────
    v_canal_actual := CASE v_scenario
      WHEN 'pendiente'      THEN 'correo'      -- próximo a enviar
      WHEN 'correo_espera'  THEN 'correo'      -- correo enviado, esperando WA
      WHEN 'wa_espera'      THEN 'whatsapp'    -- WA enviado, esperando llamada
      WHEN 'agotado'        THEN 'agotado'
      ELSE v_canal_completado                   -- el canal en que respondió
    END;

    -- ── Datos del paciente ─────────────────────────────────────────────────
    v_nombre := nombres[1 + (random() * (array_length(nombres,1)-1))::INTEGER];
    v_ap1    := apellidos[1 + (random() * (array_length(apellidos,1)-1))::INTEGER];
    v_ap2    := apellidos[1 + (random() * (array_length(apellidos,1)-1))::INTEGER];
    v_num    := lpad((floor(random() * 8900000) + 1000000)::TEXT, 7, '0');
    v_asegurado  := '1-0' || substr(v_num,1,3) || '-' || substr(v_num,4,4);
    v_ultimos4   := right(v_num, 4);
    v_id_registro := 'SEED-' || lpad(i::TEXT, 6, '0');
    v_telefono    := '6' || lpad(floor(random() * 9999999)::TEXT, 7, '0');
    v_correo_email := lower(regexp_replace(v_nombre,'[^a-zA-Z]','','g'))
                    || '.' || lower(regexp_replace(v_ap1,'[^a-zA-Z]','','g'))
                    || floor(random()*99)::TEXT || '@gmail.com';

    -- ── Tipo de atención y datos clínicos ──────────────────────────────────
    v_r := random();
    IF    v_r < 0.50 THEN v_tipo := 'cirugia';
    ELSIF v_r < 0.85 THEN v_tipo := 'consulta';
    ELSE                   v_tipo := 'procedimiento';
    END IF;

    v_especialidad := especialidades[1 + (random() * (array_length(especialidades,1)-1))::INTEGER];
    v_centro       := centros[1 + (random() * (array_length(centros,1)-1))::INTEGER];
    v_servicio     := v_especialidad;

    IF v_tipo = 'cirugia' THEN
      v_procedimiento := proc_cirugia[1 + (random() * (array_length(proc_cirugia,1)-1))::INTEGER];
      v_tipo_consulta := NULL;
      v_lateralidad   := lateralidades[1 + (random() * 3)::INTEGER];
      v_fecha_cita    := NULL;
      v_hora_cita     := NULL;
    ELSE
      v_procedimiento := NULL;
      v_tipo_consulta := tipos_consulta[1 + (random() * (array_length(tipos_consulta,1)-1))::INTEGER];
      v_lateralidad   := 'No aplica';
      v_fecha_cita    := TO_CHAR(
        CURRENT_DATE + INTERVAL '1 day' * floor(random() * 120),
        'DD/MM/YYYY'
      );
      v_hora_cita := horas_cita[1 + (random() * (array_length(horas_cita,1)-1))::INTEGER];
    END IF;

    -- ── Timestamps por canal ───────────────────────────────────────────────
    -- Reset
    v_correo_enviado_at   := NULL; v_correo_abierto_at := NULL;
    v_correo_click_at     := NULL; v_correo_estado     := 'pendiente';
    v_wa_enviado_at       := NULL; v_wa_entregado_at   := NULL;
    v_wa_leido_at         := NULL; v_wa_respondio_at   := NULL; v_wa_estado := 'pendiente';
    v_llamada_enviada_at  := NULL; v_llamada_contestada_at := NULL;
    v_llamada_completada_at := NULL; v_llamada_estado := 'pendiente'; v_llamada_intentos := 0;

    IF v_scenario != 'pendiente' THEN

      -- ── CORREO (siempre es el primer canal) ───────────────────────────────
      -- Enviado en horario laboral: campaign_date + 0-3 h (8:00-11:00)
      v_correo_enviado_at := v_campaign_date + INTERVAL '1 hour' * (random() * 3);

      IF v_scenario = 'correo_ok' THEN
        -- Abrió y respondió
        v_correo_abierto_at := v_correo_enviado_at + INTERVAL '1 hour' * (1 + random() * 47);
        v_correo_click_at   := v_correo_abierto_at + INTERVAL '1 minute' * (5 + random() * 55);
        v_correo_estado     := 'completado';

      ELSIF v_scenario = 'correo_espera' THEN
        -- Correo enviado, algunos abrieron, WA no enviado aún
        IF random() < 0.55 THEN
          v_correo_abierto_at := v_correo_enviado_at + INTERVAL '1 hour' * (random() * 72);
        END IF;
        v_correo_estado := CASE WHEN v_correo_abierto_at IS NOT NULL THEN 'leido' ELSE 'enviado' END;

      ELSE
        -- Correo sin respuesta → pasó a WA o siguió cadena
        IF random() < 0.52 THEN
          v_correo_abierto_at := v_correo_enviado_at + INTERVAL '1 hour' * (random() * 72);
        END IF;
        v_correo_estado := 'no_respondio';

        -- ── WHATSAPP (4-5 días después del correo) ─────────────────────────
        v_wa_enviado_at   := v_correo_enviado_at + INTERVAL '1 day' * (4 + floor(random() * 2));
        v_wa_entregado_at := v_wa_enviado_at     + INTERVAL '1 minute' * (1 + floor(random() * 5));

        IF v_scenario = 'wa_ok' THEN
          -- Leyó y respondió al WA
          v_wa_leido_at    := v_wa_entregado_at + INTERVAL '1 hour' * (random() * 18);
          v_wa_respondio_at := v_wa_leido_at    + INTERVAL '1 hour' * (random() * 3);
          v_wa_estado := 'completado';

        ELSIF v_scenario = 'wa_espera' THEN
          -- WA enviado, algunos leyeron, llamada aún no se ejecutó
          IF random() < 0.68 THEN
            v_wa_leido_at := v_wa_entregado_at + INTERVAL '1 hour' * (random() * 48);
          END IF;
          v_wa_estado := CASE WHEN v_wa_leido_at IS NOT NULL THEN 'leido' ELSE 'entregado' END;

        ELSE
          -- WA sin respuesta (llamada o agotado)
          IF random() < 0.62 THEN
            v_wa_leido_at := v_wa_entregado_at + INTERVAL '1 hour' * (random() * 48);
          END IF;
          v_wa_estado := 'no_respondio';

          -- ── VOICEBOT / LLAMADA (4-5 días después del WA) ──────────────────
          v_llamada_enviada_at := v_wa_enviado_at + INTERVAL '1 day' * (4 + floor(random() * 2));
          v_llamada_intentos   := (1 + floor(random() * 3))::SMALLINT;

          IF v_scenario = 'llamada_ok' THEN
            -- Contestó al voicebot
            v_llamada_contestada_at := v_llamada_enviada_at
                                     + INTERVAL '1 hour' * (random() * 6)
                                     + INTERVAL '1 hour' * (v_llamada_intentos - 1) * 2;
            v_llamada_completada_at := v_llamada_contestada_at
                                     + INTERVAL '1 minute' * (5 + floor(random() * 15));
            v_llamada_estado := 'completado';

          ELSE
            -- agotado: llamada también sin respuesta
            v_llamada_estado := 'no_respondio';

          END IF;
        END IF;
      END IF;
    END IF;

    -- ── Timestamps del registro ────────────────────────────────────────────
    -- created_at: importado 1-10 días antes de la campaña
    IF v_campaign_date IS NOT NULL THEN
      v_created_at := v_campaign_date - INTERVAL '1 day' * (1 + floor(random() * 9));
    ELSE
      v_created_at := CURRENT_TIMESTAMP - INTERVAL '1 day' * floor(random() * 10);
    END IF;

    -- updated_at: el último evento de canal registrado
    v_updated_at := COALESCE(
      v_llamada_completada_at,
      v_wa_respondio_at,
      v_correo_click_at,
      v_llamada_enviada_at,
      v_wa_enviado_at,
      v_correo_enviado_at,
      v_created_at
    ) + INTERVAL '1 second' * floor(random() * 300);

    -- ── INSERT registros ───────────────────────────────────────────────────
    INSERT INTO registros (
      id_registro, nombre_paciente, numero_asegurado, cedula_raw, telefono, correo,
      especialidad, centro_medico, tipo_atencion, nombre_servicio,
      lateralidad, procedimiento, tipo_consulta, fecha_cita, hora_cita,
      ultimos_4_asegurado, token, link_expires_at, estado,
      canal_orden, canal_actual, canal_completado,
      correo_enviado_at, correo_abierto_at, correo_click_at, correo_estado,
      whatsapp_enviado_at, whatsapp_entregado_at, whatsapp_leido_at,
      whatsapp_respondio_at, whatsapp_estado,
      llamada_enviada_at, llamada_contestada_at, llamada_completada_at,
      llamada_estado, llamada_intentos,
      created_at, updated_at
    ) VALUES (
      v_id_registro,
      v_nombre || ' ' || v_ap1 || ' ' || v_ap2,
      v_asegurado,
      REGEXP_REPLACE(v_asegurado, '[^0-9]', '', 'g'),
      v_telefono,
      v_correo_email,
      v_especialidad,
      v_centro,
      v_tipo,
      v_servicio,
      v_lateralidad,
      v_procedimiento,
      v_tipo_consulta,
      v_fecha_cita,
      v_hora_cita,
      v_ultimos4,
      gen_random_uuid(),
      v_created_at + INTERVAL '30 days',
      v_estado,
      'correo,whatsapp,llamada',
      v_canal_actual,
      v_canal_completado,
      v_correo_enviado_at, v_correo_abierto_at, v_correo_click_at, v_correo_estado,
      v_wa_enviado_at, v_wa_entregado_at, v_wa_leido_at, v_wa_respondio_at, v_wa_estado,
      v_llamada_enviada_at, v_llamada_contestada_at, v_llamada_completada_at,
      v_llamada_estado, v_llamada_intentos,
      v_created_at,
      v_updated_at
    );

    -- ── INSERT respuestas (solo registros con respuesta final) ─────────────
    IF v_estado != 'PENDIENTE' THEN

      -- Paso 1
      v_paso1 := CASE WHEN v_estado = 'NO_AUTORIZO' THEN 'no_autorizo' ELSE 'si_autorizo' END;

      -- Paso 2
      IF v_estado = 'NO_VERIFICADO' THEN
        v_paso2 := 'fallida'; v_paso2_int := 3;
      ELSIF v_estado = 'NO_AUTORIZO' THEN
        v_paso2 := NULL; v_paso2_int := 0;
      ELSE
        v_paso2 := 'exitosa'; v_paso2_int := 1;
      END IF;

      -- Paso 3
      v_paso3 := CASE
        WHEN v_estado IN ('NO_AUTORIZO','NO_VERIFICADO') THEN NULL
        WHEN v_estado = 'INFO_INCORRECTA'                THEN 'no'
        ELSE 'si'
      END;

      -- Paso 4
      v_paso4 := CASE
        WHEN v_estado IN ('NO_AUTORIZO','NO_VERIFICADO','INFO_INCORRECTA') THEN NULL
        WHEN v_estado = 'DEPURADO_RENUNCIA'  THEN 'no_ya_no_deseo'
        WHEN v_estado = 'NO_ASEGURADO'       THEN 'no_asegurado'
        ELSE 'si'
      END;

      -- Motivo retiro
      v_motivo_retiro := CASE
        WHEN v_estado = 'DEPURADO_RENUNCIA' THEN
          motivos_retiro[1 + (random() * (array_length(motivos_retiro,1)-1))::INTEGER]
        ELSE NULL
      END;

      -- Paso 5a: flexibilidad de centro
      v_flex := CASE
        WHEN v_paso4 = 'si' THEN CASE WHEN random() < 0.68 THEN 'si' ELSE 'no' END
        ELSE NULL
      END;

      -- Paso 5b: condiciones para asistir
      v_cond_asistir := CASE
        WHEN v_paso4 = 'si' THEN CASE WHEN random() < 0.78 THEN 'si' ELSE 'no' END
        ELSE NULL
      END;

      -- Paso 5b: motivo no asistir (solo si no puede)
      v_motivo_asistir := CASE
        WHEN v_cond_asistir = 'no' THEN
          motivos_no_asistir[1 + (random() * (array_length(motivos_no_asistir,1)-1))::INTEGER]
        ELSE NULL
      END;

      -- Paso 6: medio de contacto preferido
      v_contacto := CASE
        WHEN v_paso4 = 'si' THEN
          medios_contacto[1 + (random() * (array_length(medios_contacto,1)-1))::INTEGER]
        ELSE NULL
      END;

      -- Completado y paso de abandono
      v_completado := v_estado IN (
        'ACTIVO','DEPURADO_RENUNCIA','NO_ASEGURADO',
        'DEPURADO_YA_ATENDIDO','DEPURADO_YA_PROGRAMADO'
      );
      v_abandono := CASE
        WHEN v_estado = 'NO_AUTORIZO'     THEN 1
        WHEN v_estado = 'NO_VERIFICADO'   THEN 2
        WHEN v_estado = 'INFO_INCORRECTA' THEN 3
        ELSE NULL
      END;

      -- El canal de la respuesta = el canal que completó el flujo
      INSERT INTO respuestas (
        id_registro, canal,
        paso_1_consentimiento, paso_2_verificacion, paso_2_intentos,
        paso_3_info_correcta, paso_4_desea_continuar, motivo_retiro,
        paso_5a_flexibilidad_centro, paso_5b_condiciones_asistir,
        paso_5b_motivo_no_asistir, paso_6_medio_contacto,
        estado_final, completado, paso_abandono,
        created_at, updated_at
      ) VALUES (
        v_id_registro,
        COALESCE(v_canal_completado, 'correo'),
        v_paso1, v_paso2, v_paso2_int,
        v_paso3, v_paso4, v_motivo_retiro,
        v_flex, v_cond_asistir,
        v_motivo_asistir, v_contacto,
        v_estado, v_completado, v_abandono,
        COALESCE(
          v_llamada_completada_at,
          v_wa_respondio_at,
          v_correo_click_at
        ) + INTERVAL '1 minute' * floor(random() * 10),
        COALESCE(
          v_llamada_completada_at,
          v_wa_respondio_at,
          v_correo_click_at
        ) + INTERVAL '1 minute' * (10 + floor(random() * 20))
      );

    END IF;

  END LOOP;

  RAISE NOTICE '✓ Seed completado: 15,000 registros en 9 lotes de campaña (correo → WA → voicebot)';
END $$;
