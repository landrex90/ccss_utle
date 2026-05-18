# Manual de Operación Interno — COCO Tech AI
## Proyecto CCSS UTLE — Plataforma Multicanal Lista de Espera

**Contrato:** 2026LE-000001-2299  
**Fecha inicio:** 15 mayo 2026 | **Fecha objetivo:** 26 junio 2026  
**Versión:** 1.0 | **Actualizado:** 18 mayo 2026  

> Documento interno de uso exclusivo COCO Tech. No compartir con cliente.

---

## ÍNDICE

1. [Arquitectura del sistema](#1-arquitectura)
2. [Credenciales y entornos](#2-credenciales)
3. [Base de datos — Supabase](#3-base-de-datos)
4. [Flujo de una campaña completa](#4-flujo-campaña)
5. [Scripts operativos](#5-scripts)
6. [Canal correo — Mailchimp](#6-mailchimp)
7. [Canal WhatsApp](#7-whatsapp)
8. [Canal voicebot](#8-voicebot)
9. [Dashboard Looker Studio](#9-looker-studio)
10. [Despliegue — Netlify](#10-despliegue)
11. [Migraciones de base de datos](#11-migraciones)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Arquitectura

```
UTLE entrega CSV
      ↓
import-patients.js → Supabase (tabla: registros)
      ↓
Genera pacientes_urls.csv (id_registro + telefono + url)
      ↓
┌─────────────────────────────────────┐
│         CASCADA DE CANALES          │
│                                     │
│  1° WhatsApp (plataforma COCO)      │
│     ↓ sin respuesta mismo día       │
│  2° Voicebot/Llamada (Infobip)      │
│     ↓ sin respuesta mismo día       │
│  3° Correo (esta app + Mailchimp)   │
└─────────────────────────────────────┘
      ↓
Resultados externos llegan como Excel/CSV
      ↓
import-resultados-canal.js → actualiza Supabase
      ↓
Dashboard Looker Studio (tiempo real para UTLE)
```

### Stack tecnológico

| Componente | Herramienta |
|-----------|-------------|
| Frontend/App web | Next.js 14 (App Router) |
| Base de datos | Supabase (PostgreSQL) |
| Hosting | Netlify |
| Correo masivo | Mailchimp Marketing API v3 |
| WhatsApp Business | Plataforma COCO |
| Voicebot/Llamadas | Infobip (NO mencionar al cliente) |
| Dashboard | Looker Studio + Google Sheets |

---

## 2. Credenciales y entornos

### Archivo `.env.local` (nunca subir a git)

```env
NEXT_PUBLIC_SUPABASE_URL=https://yknqcfyptjvpfahfdwch.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
MAILCHIMP_API_KEY=...
MAILCHIMP_LIST_ID=...
MAILCHIMP_FROM_NAME=CCSS - Lista de Espera
MAILCHIMP_REPLY_TO=noreply@ccss.sa.cr
LINK_EXPIRATION_DAYS=3
COCO_WEBHOOK_URL=...
COCO_WEBHOOK_SECRET=...
```

### Entornos

| Entorno | URL | Branch | Cuándo usar |
|---------|-----|--------|-------------|
| Preproducción | https://ccss-utle-preprod.netlify.app | `develop` | Pruebas y validación cliente |
| Producción | Pendiente confirmar | `main` | Campañas reales |

### Acceso Supabase
- Dashboard: https://supabase.com/dashboard/project/yknqcfyptjvpfahfdwch
- SQL Editor: panel izquierdo → SQL Editor

---

## 3. Base de datos

### Tabla principal: `registros`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id_registro` | TEXT PK | ID único del paciente (del CSV o auto-generado) |
| `nombre_paciente` | TEXT | Nombre completo |
| `numero_asegurado` | TEXT | Número de asegurado completo |
| `ultimos_4_asegurado` | TEXT | PIN de verificación (4 dígitos) |
| `correo` | TEXT | Email del paciente |
| `telefono` | TEXT | Teléfono — **llave de cruce con canales externos** |
| `centro_medico` | TEXT | Centro médico |
| `tipo_atencion` | TEXT | `consulta` / `cirugia` / `procedimiento` |
| `especialidad` | TEXT | Especialidad médica |
| `nombre_servicio` | TEXT | Nombre del servicio |
| `procedimiento` | TEXT | Nombre del procedimiento |
| `lateralidad` | TEXT | Lateralidad si aplica |
| `tipo_consulta` | TEXT | Tipo de consulta |
| `fecha_cita` | TEXT | Fecha de cita asignada |
| `hora_cita` | TEXT | Hora de la cita |
| `token` | UUID | Token único del enlace web |
| `link_expires_at` | TIMESTAMPTZ | Expiración del enlace (3 días) |
| `estado` | TEXT | Estado final del paciente |
| `campana_id` | TEXT | ID de campaña |
| **Canal cascada** | | |
| `canal_orden` | TEXT | Orden de canales: `whatsapp,llamada,correo` |
| `canal_actual` | TEXT | Canal activo actualmente |
| `canal_completado` | TEXT | Canal por el que completó |
| `whatsapp_enviado_at` | TIMESTAMPTZ | Timestamp WA enviado |
| `whatsapp_entregado_at` | TIMESTAMPTZ | Timestamp WA entregado |
| `whatsapp_leido_at` | TIMESTAMPTZ | Timestamp WA leído |
| `whatsapp_respondio_at` | TIMESTAMPTZ | Timestamp primera respuesta WA |
| `whatsapp_estado` | TEXT | `pendiente/enviado/completado/no_respondio` |
| `llamada_enviada_at` | TIMESTAMPTZ | Timestamp llamada iniciada |
| `llamada_contestada_at` | TIMESTAMPTZ | Timestamp llamada contestada |
| `llamada_completada_at` | TIMESTAMPTZ | Timestamp flujo completado |
| `llamada_estado` | TEXT | Estado de la llamada |
| `llamada_intentos` | SMALLINT | Número de intentos de llamada |
| `correo_enviado_at` | TIMESTAMPTZ | Timestamp correo enviado |
| `correo_abierto_at` | TIMESTAMPTZ | Timestamp correo abierto |
| `correo_click_at` | TIMESTAMPTZ | Timestamp clic en enlace |
| `correo_estado` | TEXT | Estado del correo |
| **Respuestas del flujo** | | |
| `paso_4_desea_continuar` | TEXT | `si/no_ya_no_deseo/no_asegurado` |
| `paso_4_motivo_retiro` | TEXT | Motivo si no desea continuar |
| `paso_5a_acepta_otro_centro` | TEXT | `si/no` |
| `paso_5b_puede_asistir` | TEXT | `si/no` |
| `paso_5b_motivo_no_asistir` | TEXT | Motivo si no puede asistir |
| `paso_6_preferencia_contacto` | TEXT | Medio de contacto preferido |

### Estados posibles (`estado`)

| Estado | Significado |
|--------|-------------|
| `PENDIENTE` | No ha completado el proceso |
| `ACTIVO` | Completó — desea continuar en lista |
| `NO_AUTORIZO` | No autorizó en Paso 1 |
| `NO_VERIFICADO` | Falló 3 veces la verificación |
| `INFO_INCORRECTA` | Datos clínicos no coinciden |
| `DEPURADO_RENUNCIA` | Ya no desea la atención |
| `DEPURADO_YA_ATENDIDO` | Ya fue atendido |
| `DEPURADO_YA_PROGRAMADO` | Ya tiene cita |
| `NO_ASEGURADO` | Ya no está asegurado |

### Tabla: `intentos_validacion`

Registra cada intento fallido de verificación de identidad (máximo 3 por paciente).

---

## 4. Flujo de una campaña completa

### Paso 1 — Recibir CSV de la UTLE

La UTLE envía el archivo con los pacientes a contactar. Verificar que tenga las columnas requeridas:

**Obligatorias:** `nombre_paciente`, `numero_asegurado`, `ultimos_4_asegurado`, `correo`, `telefono`, `centro_medico`, `tipo_atencion`  
**Opcionales:** `especialidad`, `nombre_servicio`, `procedimiento`, `lateralidad`, `tipo_consulta`, `fecha_cita`, `hora_cita`, `id_registro`

### Paso 2 — Importar pacientes

```bash
node --env-file=.env.local scripts/import-patients.js pacientes.csv https://[url-produccion] --campana 2026-05_HospMexico
```

Genera: `pacientes_urls.csv` → contiene `id_registro`, `telefono`, `correo`, `url`

### Paso 3 — Distribuir a canales externos

Del archivo `pacientes_urls.csv`:
- **WhatsApp:** enviar lista con `telefono` + `id_registro` a plataforma COCO
- **Voicebot:** enviar lista con `telefono` + `id_registro` a Infobip

### Paso 4 — Activar canal de correo (Mailchimp)

Ver sección 6.

### Paso 5 — Recibir resultados externos e importar

```bash
# Cuando llega el Excel de WhatsApp
node --env-file=.env.local scripts/import-resultados-canal.js resultados_wa.csv --canal whatsapp

# Cuando llega el Excel del voicebot
node --env-file=.env.local scripts/import-resultados-canal.js resultados_llamada.csv --canal llamada
```

### Paso 6 — Monitorear en Looker Studio

Ver sección 9.

### Paso 7 — Cierre de campaña

Al vencer los 3 días:
1. Exportar reporte final desde Supabase
2. Compartir con UTLE para acciones (depurar, verificar, reagendar)

---

## 5. Scripts operativos

### `scripts/import-patients.js`

Importa el CSV inicial de la UTLE, genera tokens y exporta URLs.

```bash
node --env-file=.env.local scripts/import-patients.js <archivo.csv> <url-base> --campana <ID>
```

**Output:** `<archivo>_urls.csv` con columnas: `id_registro, nombre_paciente, correo, telefono, tipo_atencion, especialidad, centro_medico, campana_id, url`

---

### `scripts/import-resultados-canal.js`

Importa resultados de canales externos y actualiza cascada en Supabase.

```bash
node --env-file=.env.local scripts/import-resultados-canal.js <resultados.csv> --canal <whatsapp|llamada>
```

**Columnas esperadas en el CSV de resultados:**

| Columna | Requerida | Valores |
|---------|-----------|---------|
| `id_registro` | Sí (o telefono) | REG-000001 |
| `telefono` | Sí (o id_registro) | 88889999 |
| `estado_canal` | Sí | `completado / no_respondio / fallido` |
| `enviado_at` | No | 2026-05-20 08:00 |
| `respondio_at` | No | 2026-05-20 08:05 |
| `contestado_at` | No (solo llamada) | 2026-05-20 09:00 |
| `completado_at` | No | 2026-05-20 09:10 |
| `intentos` | No (solo llamada) | 2 |

---

### Regenerar links de prueba (TEST-AZ-001/002/003)

```bash
node --env-file=.env.local -e "
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = ['TEST-AZ-001', 'TEST-AZ-002', 'TEST-AZ-003'];
const expires = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
(async () => {
  for (const id of ids) {
    const token = crypto.randomUUID();
    await supabase.from('registros').update({ token, link_expires_at: expires, estado: 'PENDIENTE' }).eq('id_registro', id);
    console.log(id, '→ https://ccss-utle-preprod.netlify.app/utle?t=' + token);
  }
  await supabase.from('intentos_validacion').delete().in('id_registro', ids);
})();
"
```

PIN de prueba: **1234** para todos.

---

## 6. Canal correo — Mailchimp

### Configuración inicial (una sola vez)
1. Verificar dominio `ccss.sa.cr` en Mailchimp → Account → Domains
2. TI CCSS debe agregar registros DNS (SPF + 2 CNAME) — ver documento de solicitud
3. Confirmar From: `gm_utle_gelisespera@ccss.sa.cr`

### Por campaña
1. Importar audiencia en Mailchimp con las columnas: `EMAIL`, `FNAME` (nombre), `MMERGE6` (URL personalizada)
2. El `MMERGE6` es la columna `url` del archivo `pacientes_urls.csv`
3. Seleccionar plantilla: `scripts/mailchimp_template_ccss.html`
4. El botón CTA usa `*|MMERGE6|*` como href
5. Programar envío

### Plantilla del correo
- Archivo: `scripts/mailchimp_template_ccss.html`
- PDF de referencia: `scripts/plantilla_correo_ccss_v2.pdf`
- Horario UTLE en footer: Lunes a jueves 7am–4pm · Viernes 7am–3pm

---

## 7. Canal WhatsApp

- **Operado desde:** plataforma COCO (no esta app)
- **Número:** pendiente — la UTLE debe enviarlo
- **Variables de cruce:** `telefono` + `id_registro` del archivo `pacientes_urls.csv`
- **Resultados:** Excel con `id_registro/telefono` + `estado_canal`
- **Importar resultados:** `import-resultados-canal.js --canal whatsapp`

---

## 8. Canal voicebot

- **Operado desde:** Infobip (NO mencionar al cliente)
- **Flujo:** idéntico al flujo web de 6 pasos en formato de voz
- **Variables de cruce:** `telefono` + `id_registro`
- **Resultados:** Excel con `id_registro/telefono` + `estado_canal` + timestamps
- **Importar resultados:** `import-resultados-canal.js --canal llamada`

---

## 9. Dashboard Looker Studio

**Estado:** pendiente de configuración

### Pasos para configurar
1. Conectar Looker Studio a Supabase (PostgreSQL directo)
   - Host: `db.yknqcfyptjvpfahfdwch.supabase.co`
   - Puerto: `5432`
   - Base de datos: `postgres`
   - Usuario: `postgres`
2. Crear vistas en Supabase para simplificar las queries del dashboard
3. Dar acceso de solo lectura a cuentas Google de la UTLE (pendiente confirmar)

### Métricas clave del dashboard
- Total pacientes por estado
- Tasa de completación por canal
- Funnel de cascada (WA → llamada → correo)
- Motivos de retiro y no asistencia
- Progreso por centro médico y campaña

---

## 10. Despliegue — Netlify

### Comando de deploy (preproducción)

```bash
npm run build && npx netlify-cli deploy --prod --dir=.next
```

### Flujo de ramas

```
feature/* → develop (preprod) → main (producción)
```

- `develop` → despliega en `ccss-utle-preprod.netlify.app`
- `main` → producción (URL pendiente de confirmar)
- **NUNCA hacer merge a `main` sin validación previa de la UTLE**

---

## 11. Migraciones de base de datos

| # | Archivo | Estado | Descripción |
|---|---------|--------|-------------|
| 001 | `001_initial_schema.sql` | ✅ Aplicada | Esquema inicial |
| 002 | `002_security.sql` | ✅ Aplicada | Seguridad y RLS |
| 003 | `003_verification.sql` | ✅ Aplicada | Intentos de validación |
| 004 | `004_v3_1_fields.sql` | ✅ Aplicada | Campos v3.1 |
| 005 | `005_performance.sql` | ⚠️ Pendiente | Índices de rendimiento |
| 006 | `006_canal_cascada.sql` | ✅ Aplicada | Trazabilidad multicanal |

### Aplicar migración 005 (pendiente)

En Supabase SQL Editor → New query:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_token ON registros (token);
CREATE INDEX IF NOT EXISTS idx_intentos_registro ON intentos_validacion (id_registro);
```

---

## 12. Troubleshooting

### "El link no me funciona" (paciente)
1. Verificar si el token existe en Supabase: `SELECT * FROM registros WHERE token = 'xxx'`
2. Verificar si `link_expires_at` ya venció
3. Si venció → regenerar token con el script de regeneración (sección 5)

### "Ingresé mal el PIN y me bloqueó"
```sql
-- Limpiar intentos fallidos de un paciente
DELETE FROM intentos_validacion WHERE id_registro = 'REG-000001';
-- Resetear estado
UPDATE registros SET estado = 'PENDIENTE' WHERE id_registro = 'REG-000001';
```

### "No recibí el correo"
1. Verificar correo en Supabase: `SELECT correo FROM registros WHERE id_registro = 'xxx'`
2. Verificar en Mailchimp si fue enviado o rebotó
3. Si correo es correcto → reenviar desde Mailchimp

### "Los datos del paciente están incorrectos" (INFO_INCORRECTA)
1. El estado queda como `INFO_INCORRECTA` automáticamente
2. La UTLE debe verificar el expediente en su sistema
3. Si hay error en los datos importados → corregir en Supabase y resetear estado a `PENDIENTE`

### Deploy falla en Netlify
1. Verificar que `npm run build` no tenga errores de TypeScript
2. Verificar variables de entorno en Netlify dashboard
3. Si falla por caché: `rm -rf .next && npm run build`

### Supabase — consultas útiles

```sql
-- Resumen de estados de una campaña
SELECT estado, COUNT(*) FROM registros WHERE campana_id = '2026-05_HospMexico' GROUP BY estado;

-- Pacientes pendientes por canal
SELECT canal_actual, COUNT(*) FROM registros WHERE estado = 'PENDIENTE' GROUP BY canal_actual;

-- Tasa de completación por canal
SELECT canal_completado, COUNT(*) FROM registros WHERE canal_completado IS NOT NULL GROUP BY canal_completado;

-- Pacientes bloqueados (3 intentos fallidos)
SELECT r.id_registro, r.nombre_paciente FROM registros r
JOIN intentos_validacion i ON r.id_registro = i.id_registro
WHERE r.estado = 'NO_VERIFICADO';
```

---

*Manual interno COCO Tech AI — Actualizar con cada cambio relevante al proyecto*
