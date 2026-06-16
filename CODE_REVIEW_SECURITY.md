# Revisión de Código — CCSS UTLE
**Fecha revisión inicial:** 2026-06-15  
**Última actualización:** 2026-06-16  
**Revisor:** Claude (revisión de seguridad y arquitectura)  
**Rama:** `develop`

---

## Resumen ejecutivo

La aplicación tiene una arquitectura de seguridad sólida: service key solo en server-side, `ultimos_4_asegurado` nunca expuesto al frontend, RLS habilitado en todas las tablas, cookies httpOnly, whitelist de estados.

**Estado tras dos iteraciones de corrección:** todos los hallazgos **CRÍTICOS y ALTOS están resueltos y verificados**. Resultado final: **15 resueltos + 2 parciales + 3 diferidos** sobre 20 hallazgos. La app está lista para producción desde el punto de vista de seguridad. Pendiente operativo: configurar `ADMIN_SESSION_SECRET` en Netlify (prod y preprod) para habilitar rotación de sesiones sin cambiar contraseña.

### Tablero de estado

| Estado | Hallazgos |
|--------|-----------|
| ✅ Resuelto y verificado | C-1, C-2, C-3, A-1, A-2, A-3, A-4, A-5, A-6, M-1, M-3, B-1, B-2, B-4, N-1 |
| ⏳ Parcial | M-2 (solo import-patients; import-results pendiente), M-5 (estado_canal ✅; CAMPOS_RESPUESTA pendiente) |
| ⏳ Diferido (acordado) | M-4, M-6, B-3 |

---

## 🔴 CRÍTICOS

### C-1 — Error de sintaxis en `survey-response/route.ts` — Build roto · ✅ RESUELTO

> **Resuelto:** el destructuring se movió antes del `fetch` (`survey-response/route.ts:111`). Sintaxis válida, webhook funcional.

**Archivo:** `app/api/survey-response/route.ts` — líneas 97–99

**Problema:**
```ts
// ACTUAL (inválido — una sentencia dentro de un object literal):
headers: { 'Content-Type': 'application/json', ... },
  const { verification_token: _vt, ...safeBody } = body   // ← JS inválido
  body: JSON.stringify({ ...safeBody, ... }),
```

La desestructuración está ubicada dentro del objeto de opciones del `fetch`. Esto es sintaxis JavaScript inválida. El bloque `try/catch` capturaría el `ReferenceError` en runtime y devolvería 500, rompiendo todos los envíos finales de pacientes silenciosamente.

**Corrección:**
```ts
// Mover el destructuring ANTES del fetch:
const { verification_token: _vt, ...safeBody } = body

const whRes = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(process.env.COCO_WEBHOOK_SECRET
      ? { Authorization: `Bearer ${process.env.COCO_WEBHOOK_SECRET}` }
      : {}),
  },
  body: JSON.stringify({ ...safeBody, timestamp: new Date().toISOString() }),
})
```

---

### C-2 — Cookie admin con valor predecible (base64 de la contraseña) · ✅ RESUELTO

> **Resuelto:** `admin-auth.ts:10-14` ahora usa `HMAC-SHA256(ADMIN_SESSION_SECRET, password)` en hex. La cookie ya no es reversible a la contraseña. Rotar `ADMIN_SESSION_SECRET` invalida todas las sesiones activas.

**Archivo:** `lib/admin-auth.ts` — líneas 6–8

**Problema:**
```ts
export function getExpectedCookieValue(): string {
  const password = process.env.ADMIN_PASSWORD ?? ''
  return Buffer.from(password).toString('base64')  // base64 ≠ hash
}
```

La cookie `admin_session` contiene `base64(ADMIN_PASSWORD)`. Un atacante que robe la cookie (vía XSS, logs o tráfico) obtiene la contraseña en texto plano con un simple `atob()`. Cualquier persona que conozca la contraseña puede calcular el valor exacto de la cookie sin haber pasado por el login.

**Corrección:**
```ts
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

// En login (auth/route.ts): generar token firmado
const sessionToken = randomBytes(32).toString('hex')
const sig = createHmac('sha256', process.env.ADMIN_PASSWORD!)
              .update(sessionToken).digest('hex')
const cookieValue = `${sessionToken}.${sig}`

// En validación (admin-auth.ts):
export function validateAdminSession(request: NextRequest): boolean {
  const cookie = request.cookies.get(COOKIE_NAME)
  if (!cookie) return false
  const [token, sig] = cookie.value.split('.')
  if (!token || !sig) return false
  const expected = createHmac('sha256', process.env.ADMIN_PASSWORD!)
                    .update(token).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
```

---

### C-3 — Comparación de contraseña sin `timingSafeEqual` en login · ✅ RESUELTO

> **Resuelto:** `auth/route.ts:42-44` usa `crypto.timingSafeEqual` con verificación de longitud previa. La comparación de la cookie (`cookiesMatch`) también es timing-safe.

**Archivo:** `app/api/admin/auth/route.ts` — línea 17

**Problema:**
```ts
if (password !== adminPassword) {  // vulnerable a timing attack
```

La comparación directa de strings es vulnerable a timing attacks: un atacante puede medir diferencias de microsegundos para adivinar la contraseña carácter por carácter. Con un solo factor de autenticación en un sistema de salud pública, esto es material.

**Corrección:**
```ts
import { timingSafeEqual } from 'crypto'

const a = Buffer.from(password)
const b = Buffer.from(adminPassword)
if (a.length !== b.length || !timingSafeEqual(a, b)) {
  return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
}
```

---

## 🟠 ALTOS

### A-1 — Sin rate limiting en el endpoint de login admin · ✅ RESUELTO

> **Resuelto:** `auth/route.ts:29-40` cuenta fallos por IP en ventana de 15 min y bloquea (429) a los 5 intentos. Persiste en la tabla `admin_login_attempts` (migración 009) — correcto para entorno serverless. **Pendiente menor:** habilitar RLS en esa tabla (ver N-1).

**Archivo:** `app/api/admin/auth/route.ts`

**Problema:** No hay control de intentos fallidos. Un atacante puede hacer fuerza bruta sin límite contra `POST /api/admin/auth`. Combinado con C-3, la contraseña es recuperable.

**Corrección:** Registrar intentos fallidos en Supabase (el Map en memoria no persiste en Netlify Functions serverless):

```ts
// Verificar intentos antes de validar contraseña:
const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
const { count } = await supabase
  .from('admin_login_attempts')
  .select('*', { count: 'exact', head: true })
  .eq('ip_address', ip)
  .eq('exitoso', false)
  .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())

if ((count ?? 0) >= 5) {
  return NextResponse.json({ error: 'Demasiados intentos. Espere 15 minutos.' }, { status: 429 })
}
```

> Alternativamente, habilitar IP allowlisting en Netlify para las rutas `/api/admin/*`.

---

### A-2 — IP del paciente tomada de `x-forwarded-for` sin validación · ✅ RESUELTO

> **Resuelto:** se usa `x-nf-client-connection-ip` con prioridad en los tres sitios: `page.tsx:101`, `validate-identity:20` y `auth/route.ts:22`.

**Archivos:** `app/utle/page.tsx:100`, `app/api/validate-identity/route.ts:20`

**Problema:**
```ts
const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim()
```

`x-forwarded-for` es un header que cualquier cliente puede fabricar. Si Netlify no lo reemplaza autoritativamente, un atacante puede falsear su IP registrada en los logs de trazabilidad.

**Corrección:** Usar el header de IP real de Netlify con prioridad:

```ts
const ip = headersList.get('x-nf-client-connection-ip')
        ?? headersList.get('x-forwarded-for')?.split(',')[0].trim()
        ?? null
```

---

### A-3 — Webhook a COCO envía datos sin verificar que el destino use HTTPS · ✅ RESUELTO

> **Resuelto:** `survey-response/route.ts:109` valida `webhookUrl.startsWith('https://')` antes de enviar.

**Archivo:** `app/api/survey-response/route.ts` — línea 89

**Problema:**
```ts
const whRes = await fetch(webhookUrl, { ... })
```

`COCO_WEBHOOK_URL` viene de una variable de entorno sin validación. Si está configurada como HTTP, se envían datos clínicos del paciente sin cifrado en tránsito.

**Corrección:**
```ts
if (!webhookUrl.startsWith('https://')) {
  console.error('COCO_WEBHOOK_URL must use HTTPS — webhook skipped for security')
} else {
  try { /* fetch ... */ } catch { /* ... */ }
}
```

---

### A-4 — `survey-response` acepta `NO_AUTORIZO` y `NO_VERIFICADO` sin ningún token · ✅ RESUELTO

> **Resuelto:** `survey-response/route.ts:39-61`. `NO_AUTORIZO` exige `paso_1_consentimiento === 'no_autorizo'`; `NO_VERIFICADO` recalcula los intentos fallidos en BD y exige `>= MAX_ATTEMPTS`. Lógica consistente con `validate-identity`.

**Archivo:** `app/api/survey-response/route.ts` — líneas 29–37

**Problema:**
```ts
const skipVerification = body.estado_final === 'NO_AUTORIZO' || body.estado_final === 'NO_VERIFICADO'
if (!skipVerification) { /* valida verification_token */ }
```

Cualquiera que conozca el `token` de un paciente (presente en la URL del correo) puede llamar directamente a `POST /api/survey-response` con `{ token: "...", estado_final: "NO_VERIFICADO" }` y marcar al paciente como no verificado sin pasar por ningún paso del formulario.

**Corrección:** Validar coherencia mínima de estado:
```ts
if (body.estado_final === 'NO_AUTORIZO') {
  if (body.paso_1_consentimiento !== 'no_autorizo') {
    return NextResponse.json({ error: 'Estado inconsistente con paso 1' }, { status: 400 })
  }
}
if (body.estado_final === 'NO_VERIFICADO') {
  if (!body.paso_2_intentos || body.paso_2_intentos < 1) {
    return NextResponse.json({ error: 'Estado inconsistente con paso 2' }, { status: 400 })
  }
}
```

---

### A-5 — Condición de carrera en primer acceso / expiración del link · ✅ RESUELTO

> **Resuelto:** `page.tsx:125` añade `.is('primer_acceso_at', null)` al UPDATE, haciéndolo atómico.

**Archivo:** `app/utle/page.tsx` — líneas 98–132

**Problema:**
```ts
if (!registro.primer_acceso_at) {
  // fetch geo (async, ~200–500ms)
  // update primer_acceso_at + link_expires_at
}
```

Si el paciente abre el link dos veces casi simultáneamente (doble-clic o dos dispositivos), ambas peticiones leerán `primer_acceso_at = null` y ambas ejecutarán el UPDATE. Resultado: dos registros de IP/dispositivo distintos y la expiración se calcula dos veces.

**Corrección:** Añadir condición `IS NULL` en el UPDATE para hacerlo atómico:
```ts
await supabase
  .from('registros')
  .update({
    primer_acceso_at:          ahora.toISOString(),
    primer_acceso_ip:          ip,
    primer_acceso_dispositivo: dispositivo,
    primer_acceso_pais:        pais,
    primer_acceso_ciudad:      ciudad,
    link_expires_at:           nuevaExpiracion,
  })
  .eq('token', t)
  .is('primer_acceso_at', null)  // ← solo actualiza si nadie llegó primero
```

---

### A-6 — `import-patients` acepta `baseUrl` sin whitelist · ✅ RESUELTO

> **Resuelto:** `import-patients/route.ts:100-107` valida contra `ALLOWED_BASE_URLS`.

**Archivo:** `app/api/admin/import-patients/route.ts` — línea 100

**Problema:**
```ts
const baseUrl = (formData.get('baseUrl') as string | null) ?? 'https://ccss-utle-preprod.netlify.app'
const url = `${baseUrl}/utle?t=${token}`
```

Un admin puede enviar cualquier `baseUrl`, incluyendo `http://attacker.com`. Las URLs resultantes con tokens reales podrían usarse para phishing si hay algún proceso automatizado que las distribuya.

**Corrección:**
```ts
const ALLOWED_BASE_URLS = [
  'https://ccss-utle.netlify.app',
  'https://ccss-utle-preprod.netlify.app',
]
const rawBase = formData.get('baseUrl') as string | null
const baseUrl = ALLOWED_BASE_URLS.includes(rawBase ?? '')
  ? rawBase!
  : ALLOWED_BASE_URLS[0]
```

---

## 🟡 MEDIOS

### M-1 — `EstadoFinal` desincronizado entre `types.ts` y el servidor · ✅ RESUELTO

> **Resuelto:** `types.ts:3-14` define `ESTADOS_VALIDOS` como única fuente de verdad; `EstadoFinal` se deriva de ella y `survey-response` la importa. Verificado: la whitelist del tipo y el `CHECK` de BD (migración 010) son consistentes.

**Archivos:** `lib/types.ts:3–11`, `app/api/survey-response/route.ts:39–42`

**Problema:**
- `types.ts` incluye `DEPURADO_YA_ATENDIDO` y `DEPURADO_YA_PROGRAMADO`
- La whitelist del servidor no los incluye
- `DEPURADO` está en la whitelist del servidor pero no en el tipo TypeScript
- `CLOSING_DATA` en `UTLEForm.tsx` también incluye los dos estados extra

**Corrección:** Una sola fuente de verdad:
```ts
// lib/types.ts
export const ESTADOS_FINALES_VALIDOS = [
  'ACTIVO', 'NO_AUTORIZO', 'NO_VERIFICADO',
  'INFO_INCORRECTA', 'DEPURADO_RENUNCIA', 'NO_ASEGURADO', 'DEPURADO',
] as const
export type EstadoFinal = typeof ESTADOS_FINALES_VALIDOS[number]

// app/api/survey-response/route.ts
import { ESTADOS_FINALES_VALIDOS } from '@/lib/types'
if (body.estado_final && !ESTADOS_FINALES_VALIDOS.includes(body.estado_final)) { ... }
```

---

### M-2 — Sin límite de tamaño en el CSV de importación · ⏳ PARCIAL

> **Estado:** `import-patients/route.ts:117-123` ya valida 5 MB. **Pendiente:** replicar el mismo límite en `import-results/route.ts` (sigue leyendo el archivo sin tope).

**Archivos:** `app/api/admin/import-patients/route.ts:110`, `app/api/admin/import-results/route.ts:137`

**Problema:**
```ts
const csvContent = await file.text()  // archivo completo en memoria
const rows = parseCSV(csvContent)     // parse completo en memoria
```

Un CSV de varios GB agotaría la memoria de la Netlify Function (límite ~1GB) o causaría timeout (10s).

**Corrección:** Añadir al inicio del handler:
```ts
const MAX_CSV_BYTES = 10 * 1024 * 1024 // 10MB
if (file.size > MAX_CSV_BYTES) {
  return new Response(
    JSON.stringify({ error: 'Archivo demasiado grande (máximo 10MB)' }),
    { status: 413, headers: { 'Content-Type': 'application/json' } }
  )
}
```

---

### M-3 — Geolocalización vía HTTP a servicio externo sin timeout · ✅ RESUELTO

> **Resuelto:** `page.tsx:108-109` usa los headers de geolocalización nativos de Netlify (`x-country-code`, `x-city`). Se eliminó la llamada HTTP a ip-api.com — ya no se envía la IP del paciente a terceros ni hay riesgo de bloqueo.

**Archivo:** `app/utle/page.tsx` — líneas 110–115

**Problemas:**
1. Llamada HTTP (no HTTPS) — la IP del paciente viaja sin cifrar
2. Sin timeout — si ip-api.com tarda, bloquea al paciente
3. ip-api.com tiene límite de 45 req/min en plan gratuito
4. La IP del paciente se envía a un tercero externo sin mención en el consentimiento

**Corrección:** Usar los headers de geolocalización nativos de Netlify (no requieren llamada externa):
```ts
// Netlify inyecta estos headers automáticamente:
const pais   = headersList.get('x-country-code') ?? null
const ciudad = headersList.get('x-city')         ?? null

// Si se prefiere mantener ip-api.com, al menos añadir timeout y HTTPS:
const geoController = new AbortController()
const geoTimeout = setTimeout(() => geoController.abort(), 2000)
try {
  const geo = await fetch(`https://ip-api.com/json/${ip}?fields=country,city&lang=es`, {
    cache: 'no-store',
    signal: geoController.signal,
  }).then(r => r.ok ? r.json() : null)
  pais   = geo?.country ?? null
  ciudad = geo?.city    ?? null
} catch { /* no bloquear el flujo */ } finally {
  clearTimeout(geoTimeout)
}
```

---

### M-4 — Respuestas duplicadas posibles sin constraint UNIQUE · ⏳ DIFERIDO

> **Estado:** pendiente para la siguiente iteración (acordado).

**Archivos:** `app/api/survey-response/route.ts:51`, `supabase/migrations/001_initial.sql:32–50`

**Problema:** Si el paciente envía el formulario dos veces en paralelo (doble-clic, dos dispositivos), ambas peticiones pueden insertar en `respuestas` antes de que el estado del registro cambie a no-PENDIENTE.

**Corrección:**

```sql
-- Nueva migración:
CREATE UNIQUE INDEX IF NOT EXISTS idx_respuestas_id_registro_completado
  ON respuestas (id_registro)
  WHERE completado = true;
```

Y en `survey-response/route.ts`, verificar idempotencia antes de insertar:
```ts
const { data: existing } = await supabase
  .from('respuestas')
  .select('id')
  .eq('id_registro', id_registro)
  .eq('completado', true)
  .maybeSingle()

if (existing) {
  return NextResponse.json({ ok: true }) // ya respondió — idempotente
}
```

---

### M-5 — Campos de respuesta en `import-results` sin validación de valores · ⏳ PARCIAL

> **Estado:** `estado_canal` ahora tiene whitelist (`ESTADOS_CANAL_VALIDOS`). Pendiente: validar valores de `CAMPOS_RESPUESTA` (`paso_4_desea_continuar`, `paso_5a_acepta_otro_centro`, etc.).

**Archivo:** `app/api/admin/import-results/route.ts` — líneas 97–104

**Problema:**
```ts
for (const campo of CAMPOS_RESPUESTA) {
  if (row[campo]) update[campo] = row[campo]  // sin validación de valores permitidos
}
```

Un CSV manipulado puede escribir valores arbitrarios en campos de respuesta del registro.

**Corrección:** Añadir whitelist de valores por campo:
```ts
const VALORES_VALIDOS: Record<string, string[]> = {
  paso_4_desea_continuar:     ['si', 'no_ya_no_deseo', 'no_asegurado'],
  paso_5a_acepta_otro_centro: ['si', 'no'],
  paso_5b_puede_asistir:      ['si', 'no'],
  paso_6_preferencia_contacto: ['llamada', 'whatsapp', 'correo', 'sms', 'cualquiera'],
}
for (const campo of CAMPOS_RESPUESTA) {
  const val = row[campo]
  if (!val) continue
  const allowed = VALORES_VALIDOS[campo]
  if (allowed && !allowed.includes(val)) continue  // ignorar valor inválido
  update[campo] = val
}
```

---

### M-6 — Sin validación de `Origin` header en rutas admin · ⏳ DIFERIDO

> **Estado:** pendiente para la siguiente iteración (acordado). Mitigado parcialmente por `sameSite:strict`.

**Archivos:** todas las rutas `app/api/admin/`

**Problema:** `sameSite:strict` mitiga CSRF en producción, pero es un único punto de fallo. En desarrollo, `secure: false` debilita la cookie. No hay validación de `Origin` o `Referer` como capa adicional.

**Corrección:** Añadir en un middleware o al inicio de cada handler admin:
```ts
const origin = request.headers.get('origin')
const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL
if (origin && allowedOrigin && origin !== allowedOrigin) {
  return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 })
}
```

---

## 🔵 BAJOS

### B-1 — `DEPURADO` en whitelist del servidor pero no en el schema de BD · ✅ RESUELTO

> **Resuelto:** migración 010 reconstruye el `CHECK` de `registros.estado` incluyendo todos los estados que la app escribe + `DEPURADO_YA_ATENDIDO`/`DEPURADO_YA_PROGRAMADO` + `DEPURADO` legacy. Verificado que es superconjunto de los estados escritos por la app.

**Archivos:** `app/api/survey-response/route.ts:41` vs `supabase/migrations/001_initial.sql:22–27`

El estado `DEPURADO` está en la whitelist del servidor pero el `CHECK` constraint de la BD no lo incluye. Un UPDATE con ese estado falla en la BD silenciosamente (el error no se captura — ver B-2).

**Corrección:** Añadir una migración:
```sql
ALTER TABLE registros DROP CONSTRAINT IF EXISTS registros_estado_check;
ALTER TABLE registros ADD CONSTRAINT registros_estado_check
  CHECK (estado IN (
    'PENDIENTE', 'NO_AUTORIZO', 'NO_VERIFICADO', 'INFO_INCORRECTA',
    'DEPURADO_YA_ATENDIDO', 'DEPURADO_YA_PROGRAMADO', 'DEPURADO_RENUNCIA',
    'ACTIVO', 'NO_ASEGURADO', 'DEPURADO'
  ));
```

---

### B-2 — Error de UPDATE de estado ignorado silenciosamente · ✅ RESUELTO

> **Resuelto:** `survey-response/route.ts:95-104` captura y loguea `updateError`.

**Archivo:** `app/api/survey-response/route.ts` — líneas 75–83

**Problema:**
```ts
if (body.estado_final) {
  await supabase.from('registros').update({ estado: body.estado_final, ... })
    .eq('id_registro', id_registro)
  // ← el error de este update no se captura ni loguea
}
```

Si el UPDATE falla, el paciente recibe `{ ok: true }` pero su estado no fue actualizado.

**Corrección:**
```ts
const { error: updateError } = await supabase
  .from('registros')
  .update({
    estado: body.estado_final,
    ...(body.completado ? { encuesta_completada_at: new Date().toISOString() } : {}),
  })
  .eq('id_registro', id_registro)

if (updateError) {
  console.error('Error updating estado:', updateError)
  // La respuesta ya fue insertada; loguear y continuar es razonable
  // pero considerar alertar a monitoring
}
```

---

### B-3 — `keep-alive.mts` usa service role key innecesariamente · ⏳ DIFERIDO

> **Estado:** pendiente para la siguiente iteración (acordado).

**Archivo:** `netlify/functions/keep-alive.mts` — líneas 5–8

Un ping de keep-alive no requiere privilegios de service role. Usar anon key reduce el impacto si la función fuera comprometida.

**Corrección:** Usar anon key o el endpoint de health de Supabase:
```ts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // anon key es suficiente
)
```

---

### B-4 — Submit final sin manejo de error al usuario · ✅ RESUELTO

> **Resuelto:** `submitResponse` ahora devuelve `{ ok: boolean }` con timeout de 15s. `closeWithState` y `handleFinalConfirm` verifican el resultado y muestran error al usuario si falla, en lugar de avanzar a la pantalla de cierre silenciosamente.

**Archivo:** `components/UTLEForm.tsx` — líneas 308–315

**Problema:**
```ts
async function handleFinalConfirm() {
  setSubmitting(true)
  const final: FormAnswers = { ...answers, estado_final: 'ACTIVO', completado: true }
  await submitResponse(final)  // sin try/catch
  setSubmitting(false)
  setClosingData(CLOSING_DATA.ACTIVO)
  setFlowStep('closing')  // avanza aunque el submit haya fallado
}
```

Si `submitResponse` falla, el paciente ve la pantalla de "gracias" pero su respuesta no fue guardada. Estado queda `PENDIENTE` en BD.

**Corrección:**
```ts
async function handleFinalConfirm() {
  setSubmitting(true)
  try {
    const res = await fetch('/api/survey-response', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...answers, estado_final: 'ACTIVO', completado: true }),
    })
    if (!res.ok) throw new Error('submit failed')
    setClosingData(CLOSING_DATA.ACTIVO)
    setFlowStep('closing')
  } catch {
    setGateError('Error al enviar su respuesta. Por favor intente nuevamente.')
  } finally {
    setSubmitting(false)
  }
}
```

---

## ⚠️ Hallazgos nuevos (segunda iteración)

### N-1 — Tabla `admin_login_attempts` sin RLS habilitado · ✅ RESUELTO

> **Resuelto:** RLS habilitado al crear la tabla — Supabase detectó el problema en el SQL Editor y el usuario activó la opción. Verificado: anon key recibe 401 al intentar acceder a la tabla.

---

## 📋 Recordatorio de configuración (Netlify)

- **`ADMIN_SESSION_SECRET`** — debe configurarse en prod y preprod. Si no está, el HMAC de la cookie (C-2) cae a usar la contraseña como secreto: sigue siendo seguro (no reversible), pero rotar sesiones sin cambiar la contraseña no funcionaría.

---

## Trazabilidad — Eventos no registrados

| Evento | Estado actual | Recomendación |
|--------|---------------|---------------|
| Intentos fallidos en `authorize-step` | No registrado | Añadir log en tabla de auditoría |
| Admin login exitoso/fallido | No registrado | Tabla `admin_audit_log` con IP + timestamp |
| Importación de CSV (quién, cuándo, cuántos) | No registrado | Log de operaciones admin |
| Fallo del webhook a COCO | Solo `console.error` | Actualizar campo `coco_webhook_failed_at` en registro |
| Acceso denegado por link expirado | No registrado | Útil para detectar enumeración de tokens |

---

## Performance

### Índice faltante en `registros.telefono`

**Archivo:** `app/api/admin/import-results/route.ts` — línea 165

```ts
.ilike('telefono', `%${telNorm}`)  // LIKE con wildcard inicial — no usa índice B-tree
```

Con volumen alto, esto es un full table scan.

**Corrección:**
```sql
-- Nueva migración: índice GIN con pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_registros_telefono_trgm ON registros USING gin (telefono gin_trgm_ops);
```

O mejor aún: normalizar el teléfono al importar pacientes y usar `=` en vez de `ILIKE`.

---

## Resumen de hallazgos

| # | Archivo | Riesgo | Descripción | Estado |
|---|---------|--------|-------------|--------|
| C-1 | `api/survey-response/route.ts` | 🔴 Crítico | Syntax error — webhook nunca ejecuta | ✅ Resuelto |
| C-2 | `lib/admin-auth.ts` | 🔴 Crítico | Cookie admin = base64(password) reversible | ✅ Resuelto |
| C-3 | `api/admin/auth/route.ts` | 🔴 Crítico | Comparación sin `timingSafeEqual` | ✅ Resuelto |
| A-1 | `api/admin/auth/route.ts` | 🟠 Alto | Sin rate limiting en login admin | ✅ Resuelto |
| A-2 | `utle/page.tsx` + 2 más | 🟠 Alto | IP falsificable vía `x-forwarded-for` | ✅ Resuelto |
| A-3 | `api/survey-response/route.ts` | 🟠 Alto | Webhook a COCO sin validar HTTPS | ✅ Resuelto |
| A-4 | `api/survey-response/route.ts` | 🟠 Alto | `NO_AUTORIZO`/`NO_VERIFICADO` sin token | ✅ Resuelto |
| A-5 | `utle/page.tsx` | 🟠 Alto | Race condition en primer acceso | ✅ Resuelto |
| A-6 | `api/admin/import-patients/route.ts` | 🟠 Alto | `baseUrl` sin whitelist | ✅ Resuelto |
| M-1 | `lib/types.ts` / `survey-response` | 🟡 Medio | `EstadoFinal` desincronizado | ✅ Resuelto |
| M-2 | `import-patients` / `import-results` | 🟡 Medio | Sin límite de tamaño de CSV | ⏳ Parcial |
| M-3 | `utle/page.tsx` | 🟡 Medio | Geo HTTP sin timeout, IP a tercero | ✅ Resuelto |
| M-4 | `api/survey-response/route.ts` | 🟡 Medio | Respuestas duplicadas (sin UNIQUE) | ⏳ Diferido |
| M-5 | `api/admin/import-results/route.ts` | 🟡 Medio | Campos de respuesta sin validación | ⏳ Parcial |
| M-6 | rutas `api/admin/` | 🟡 Medio | Sin validación de `Origin` header | ⏳ Diferido |
| B-1 | `migrations` / `survey-response` | 🔵 Bajo | `DEPURADO` no en schema BD | ✅ Resuelto |
| B-2 | `api/survey-response/route.ts` | 🔵 Bajo | Error de UPDATE ignorado | ✅ Resuelto |
| B-3 | `netlify/functions/keep-alive.mts` | 🔵 Bajo | Service role key innecesaria | ⏳ Diferido |
| B-4 | `components/UTLEForm.tsx` | 🔵 Bajo | Submit final sin manejo de error | ✅ Resuelto |
| N-1 | `migrations/011_rls_admin_login_attempts.sql` | 🔵 Bajo | `admin_login_attempts` sin RLS | ✅ Resuelto |

---

## Veredicto

**Aprobado para producción (seguridad).** Resultado: **15/20 resueltos, 2/20 parciales, 3/20 diferidos**.

Los 3 CRÍTICOS y los 6 ALTOS están resueltos y verificados. El bloque de autenticación admin (cookie HMAC + `timingSafeEqual` + rate limiting por IP) está correctamente implementado.

**Único pendiente que afecta seguridad:** configurar `ADMIN_SESSION_SECRET` en Netlify (Site settings → Environment variables, contextos prod y preprod). Sin él, C-2 sigue siendo seguro (HMAC no reversible), pero no se puede rotar sesiones activas sin cambiar la contraseña.

**Diferido a la siguiente iteración (calidad/robustez, no bloqueante):** M-2 (import-results), M-4, M-5 (CAMPOS_RESPUESTA), M-6, B-3.
