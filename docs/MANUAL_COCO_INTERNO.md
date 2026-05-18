# Manual de Operación Interno — Coco Tech AI
## Proyecto CCSS UTLE — Plataforma Multicanal Lista de Espera

**Contrato:** 2026LE-000001-2299  
**Fecha inicio:** 15 mayo 2026 | **Fecha objetivo:** 26 junio 2026  
**Versión:** 1.1 | **Actualizado:** 18 mayo 2026

> Documento interno — uso exclusivo equipo Coco Tech. No compartir con cliente.

---

## ÍNDICE

1. [Arquitectura del sistema](#1-arquitectura)
2. [Credenciales y entornos](#2-credenciales)
3. [Base de datos — Supabase](#3-base-de-datos)
4. [Flujo de una campaña completa](#4-flujo-campaña)
5. [Panel de administración `/admin`](#5-panel-admin)
6. [Scripts de terminal (avanzado)](#6-scripts)
7. [Canal correo — Mailchimp](#7-mailchimp)
8. [Canal WhatsApp](#8-whatsapp)
9. [Canal voicebot](#9-voicebot)
10. [Dashboard Looker Studio](#10-looker-studio)
11. [Despliegue — Netlify](#11-despliegue)
12. [Migraciones de base de datos](#12-migraciones)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Arquitectura

```
UTLE entrega CSV
      ↓
Panel Admin /admin  ─────OR─────  import-patients.js (terminal)
      ↓
Supabase — tabla registros
      ↓
Genera pacientes_urls.csv  →  id_registro + telefono + url
      ↓
┌──────────────────────────────────────────┐
│           CASCADA DE CANALES             │
│                                          │
│  1° WhatsApp  (Campañas COCO)            │
│       ↓ sin respuesta mismo/siguiente día│
│  2° Llamada Voicebot  (plataforma voz)   │
│       ↓ sin respuesta mismo/siguiente día│
│  3° Correo  (esta app + Mailchimp)       │
└──────────────────────────────────────────┘
      ↓
Resultados WA/Voz llegan como Excel/CSV
      ↓
Panel Admin /admin  ─────OR─────  import-resultados-canal.js
      ↓
Supabase actualizado  →  Looker Studio (UTLE ve en tiempo real)
```

### Stack tecnológico

| Componente | Herramienta |
|-----------|-------------|
| Frontend / App web | Next.js 14 (App Router) |
| Base de datos | Supabase (PostgreSQL) |
| Hosting | Netlify |
| Correo masivo | Mailchimp Marketing API v3 |
| WhatsApp Business | Campañas COCO |
| Voicebot / Llamadas | Plataforma de voz (no mencionar al cliente) |
| Dashboard | Looker Studio + Google Sheets |

---

## 2. Credenciales y entornos

### `.env.local` — variables principales

```env
NEXT_PUBLIC_SUPABASE_URL=https://yknqcfyptjvpfahfdwch.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
MAILCHIMP_API_KEY=...us21
MAILCHIMP_LIST_ID=...
MAILCHIMP_FROM_NAME=CCSS - Lista de Espera
MAILCHIMP_REPLY_TO=noreply@ccss.sa.cr
LINK_EXPIRATION_DAYS=3
ADMIN_PASSWORD=coco2026
```

### Entornos

| Entorno | URL | Branch git | Uso |
|---------|-----|-----------|-----|
| Preproducción | https://ccss-utle-preprod.netlify.app | `develop` | Pruebas y demos al cliente |
| Producción | Pendiente | `main` | Campañas reales |

### Accesos útiles

| Servicio | URL |
|---------|-----|
| Supabase dashboard | https://supabase.com/dashboard/project/yknqcfyptjvpfahfdwch |
| Netlify dashboard | https://app.netlify.com/projects/ccss-utle-preprod |
| Mailchimp | https://mailchimp.com |
| Repositorio | https://github.com/landrex90/ccss_utle |

---

## 3. Base de datos

### Tabla `registros` — campos clave

**Identificación del paciente:**
`id_registro`, `nombre_paciente`, `numero_asegurado`, `ultimos_4_asegurado` (PIN), `correo`, `telefono` ← llave de cruce con canales externos

**Clínico:** `centro_medico`, `tipo_atencion`, `especialidad`, `nombre_servicio`, `procedimiento`, `lateralidad`, `tipo_consulta`, `fecha_cita`, `hora_cita`

**Acceso web:** `token` (UUID), `link_expires_at` (3 días), `estado`, `campana_id`

**Cascada de canales:**
`canal_orden`, `canal_actual`, `canal_completado`
`whatsapp_enviado_at/entregado_at/leido_at/respondio_at/estado`
`llamada_enviada_at/contestada_at/completada_at/estado/intentos`
`correo_enviado_at/abierto_at/click_at/estado`

**Respuestas del flujo:**
`paso_4_desea_continuar`, `paso_4_motivo_retiro`, `paso_5a_acepta_otro_centro`, `paso_5b_puede_asistir`, `paso_5b_motivo_no_asistir`, `paso_6_preferencia_contacto`

### Estados posibles (`estado`)

| Estado | Qué significa |
|--------|--------------|
| `PENDIENTE` | No ha respondido todavía |
| `ACTIVO` | Completó — quiere seguir en lista |
| `NO_AUTORIZO` | No autorizó en Paso 1 |
| `NO_VERIFICADO` | Falló 3 veces el PIN |
| `INFO_INCORRECTA` | Sus datos no coinciden |
| `DEPURADO_RENUNCIA` | Ya no quiere la atención |
| `DEPURADO_YA_ATENDIDO` | Ya fue atendido |
| `DEPURADO_YA_PROGRAMADO` | Ya tiene cita |
| `NO_ASEGURADO` | Ya no está asegurado |

---

## 4. Flujo de una campaña completa

### Paso 1 — Recibir CSV de la UTLE

Columnas **obligatorias:** `nombre_paciente`, `numero_asegurado`, `ultimos_4_asegurado`, `correo`, `telefono`, `centro_medico`, `tipo_atencion`

Columnas **opcionales:** `especialidad`, `nombre_servicio`, `procedimiento`, `lateralidad`, `tipo_consulta`, `fecha_cita`, `hora_cita`, `id_registro`

### Paso 2 — Importar pacientes

**Opción A — Panel admin (recomendado):**
→ Ir a https://ccss-utle-preprod.netlify.app/admin/importar

**Opción B — Terminal:**
```bash
node --env-file=.env.local scripts/import-patients.js pacientes.csv https://[url] --campana 2026-05_HospMexico
```

Genera: `pacientes_urls.csv` con `id_registro`, `telefono`, `correo`, `url`

### Paso 3 — Distribuir a canales externos

Del archivo `pacientes_urls.csv`:
- **WhatsApp:** subir lista con `telefono` + `id_registro` a Campañas COCO
- **Voicebot:** subir lista con `telefono` + `id_registro` a plataforma de voz

### Paso 4 — Activar canal de correo

Ver sección 7 (Mailchimp).

### Paso 5 — Importar resultados de canales externos

**Opción A — Panel admin:**
→ Ir a /admin/resultados, subir Excel, seleccionar canal

**Opción B — Terminal:**
```bash
node --env-file=.env.local scripts/import-resultados-canal.js resultados_wa.csv --canal whatsapp
node --env-file=.env.local scripts/import-resultados-canal.js resultados_llamada.csv --canal llamada
```

### Paso 6 — Monitorear en Looker Studio

→ Ver sección 10.

### Paso 7 — Cierre de campaña

Al vencer los 3 días: exportar reporte y compartir con UTLE para acciones.

---

## 5. Panel de administración `/admin`

Acceso: https://ccss-utle-preprod.netlify.app/admin  
Contraseña: ver `.env.local` → `ADMIN_PASSWORD`

### Secciones disponibles

| Sección | URL | Función |
|---------|-----|---------|
| Dashboard | `/admin` | Resumen de campañas activas por estado |
| Campañas | `/admin/campanas` | Detalle de pacientes por campaña y estado |
| Importar pacientes | `/admin/importar` | Subir CSV de la UTLE y generar links |
| Resultados canales | `/admin/resultados` | Subir Excel de WA o voicebot |

### Cómo importar pacientes desde el panel

1. Ir a `/admin/importar`
2. Subir el CSV de la UTLE
3. Ingresar la URL base (preprod o prod)
4. Ingresar el ID de campaña (ej: `2026-05_HospMexico`)
5. Clic en **Importar** — el log muestra el progreso en tiempo real
6. Descargar el CSV de URLs generado al finalizar

### Cómo importar resultados externos

1. Ir a `/admin/resultados`
2. Seleccionar canal: **WhatsApp** o **Llamada**
3. Subir el CSV con los resultados
4. El sistema hace el match por `id_registro` o `telefono`
5. Muestra resumen: actualizados / no encontrados / errores

**Columnas esperadas en el CSV de resultados:**

| Columna | Requerida | Valores posibles |
|---------|-----------|-----------------|
| `id_registro` | Sí (o telefono) | REG-000001 |
| `telefono` | Sí (o id_registro) | 88889999 |
| `estado_canal` | Sí | `completado / no_respondio / fallido` |
| `enviado_at` | No | 2026-05-20 08:00 |
| `respondio_at` | No | 2026-05-20 08:05 |
| `contestado_at` | No (llamada) | 2026-05-20 09:00 |
| `completado_at` | No | 2026-05-20 09:10 |
| `intentos` | No (llamada) | 2 |

---

## 6. Scripts de terminal (avanzado)

### Regenerar links de prueba TEST-AZ-001/002/003

```bash
node --env-file=.env.local -e "
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const ids = ['TEST-AZ-001','TEST-AZ-002','TEST-AZ-003'];
const exp = new Date(Date.now()+3*24*60*60*1000).toISOString();
(async()=>{
  for(const id of ids){const t=crypto.randomUUID();await s.from('registros').update({token:t,link_expires_at:exp,estado:'PENDIENTE'}).eq('id_registro',id);console.log(id,'→ https://ccss-utle-preprod.netlify.app/utle?t='+t);}
  await s.from('intentos_validacion').delete().in('id_registro',ids);
  console.log('Intentos limpiados');
})();
"
```
PIN: **1234**

---

## 7. Canal correo — Mailchimp

### Configuración DNS (una sola vez — pendiente TI CCSS)

Registros a agregar en DNS de `ccss.sa.cr`:
1. SPF: agregar `include:servers.mcsv.net` al registro TXT existente
2. CNAME: `k1._domainkey.ccss.sa.cr` → `dkim.mcsv.net`
3. CNAME: `k2._domainkey.ccss.sa.cr` → `dkim2.mcsv.net`

### Por campaña

1. Importar audiencia con columnas: `EMAIL`, `FNAME`, `MMERGE6` (= columna `url` del CSV)
2. Seleccionar plantilla: `scripts/mailchimp_template_ccss.html`
3. From: `gm_utle_gelisespera@ccss.sa.cr`
4. El botón CTA usa merge tag `*|MMERGE6|*`
5. Programar envío

---

## 8. Canal WhatsApp

- **Operado desde:** Campañas COCO
- **Número:** pendiente — la UTLE debe confirmarlo
- **Variables de cruce:** `telefono` + `id_registro` del `pacientes_urls.csv`
- **Importar resultados:** panel `/admin/resultados` → canal WhatsApp

---

## 9. Canal voicebot

- **Operado desde:** plataforma de voz (no mencionar nombre al cliente)
- **Flujo:** idéntico al web de 6 pasos, en formato de voz
- **Variables de cruce:** `telefono` + `id_registro`
- **Importar resultados:** panel `/admin/resultados` → canal Llamada

---

## 10. Dashboard Looker Studio

**Estado:** pendiente de configuración

### Pasos para configurar

1. Conectar Looker Studio a Supabase:
   - Host: `db.yknqcfyptjvpfahfdwch.supabase.co` · Puerto: `5432`
   - Base de datos: `postgres` · Usuario: `postgres`
2. Confirmar cuentas Google de acceso (pendiente Ing. Castillo)
3. Construir vistas SQL en Supabase para las métricas

### Métricas del dashboard

- Pacientes por estado y canal
- Funnel: WA → llamada → correo
- Tasa de completación por canal y campaña
- Motivos de retiro y no asistencia
- Progreso por centro médico

---

## 11. Despliegue — Netlify

```bash
# Build + deploy preproducción
npm run build && npx netlify-cli deploy --prod --dir=.next
```

**Ramas:**
- `develop` → preprod (https://ccss-utle-preprod.netlify.app)
- `main` → producción — **NO hacer merge sin validación de UTLE**

---

## 12. Migraciones de base de datos

| # | Archivo | Estado |
|---|---------|--------|
| 001 | `001_initial_schema.sql` | ✅ |
| 002 | `002_campana.sql` | ✅ |
| 003 | `003_verification_token.sql` | ✅ |
| 004 | `004_v3_1_fields.sql` | ✅ |
| 005 | `005_performance.sql` | ⚠️ **Pendiente aplicar** |
| 006 | `006_canal_cascada.sql` | ✅ |

### Aplicar migración 005 (pendiente)

En Supabase → SQL Editor → New query:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_token ON registros (token);
CREATE INDEX IF NOT EXISTS idx_intentos_registro ON intentos_validacion (id_registro);
```

---

## 13. Troubleshooting

### "El link no funciona"
Verificar expiración: `SELECT link_expires_at, estado FROM registros WHERE token='xxx'`
Si venció → regenerar token (sección 6 o panel admin).

### "Me bloqueó después de 3 intentos"
```sql
DELETE FROM intentos_validacion WHERE id_registro = 'REG-000001';
UPDATE registros SET estado = 'PENDIENTE' WHERE id_registro = 'REG-000001';
```

### Consultas útiles Supabase

```sql
-- Resumen de una campaña
SELECT estado, COUNT(*) n FROM registros
WHERE campana_id = '2026-05_HospMexico' GROUP BY estado ORDER BY n DESC;

-- Cascada: pacientes por canal actual
SELECT canal_actual, COUNT(*) FROM registros
WHERE estado = 'PENDIENTE' GROUP BY canal_actual;

-- Qué canal completó más
SELECT canal_completado, COUNT(*) FROM registros
WHERE canal_completado IS NOT NULL GROUP BY canal_completado;
```

---

*Coco Tech AI — Actualizar con cada cambio relevante*
