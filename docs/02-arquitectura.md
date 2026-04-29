# Arquitectura técnica

## Stack tecnológico

| Capa | Tecnología | Versión | Rol |
|---|---|---|---|
| Frontend | Next.js (App Router) | 14.2.35 | UI del formulario |
| Backend | Next.js API Routes | 14.2.35 | Validación e identidad, guardado de respuestas |
| Base de datos | Supabase (PostgreSQL) | — | Almacenamiento de registros y respuestas |
| Hosting | Netlify | — | Deploy y serverless functions |
| Lenguaje | TypeScript | 5.x | Todo el código |
| Estilos | Tailwind CSS | 3.x | UI, accesibilidad, dark mode |

---

## Diagrama de arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   PACIENTE                          │
│  Recibe correo → Abre enlace → Completa formulario  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────┐
│              NETLIFY (Edge + Functions)             │
│                                                     │
│  /utle?t=<uuid>          ← Página del formulario   │
│  /api/validate-identity  ← Valida identidad        │
│  /api/survey-response    ← Guarda respuesta        │
│  /admin                  ← Panel administrativo    │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS (service role key)
                       ▼
┌─────────────────────────────────────────────────────┐
│                  SUPABASE                           │
│                                                     │
│  registros          ← Datos de pacientes           │
│  respuestas         ← Respuestas del formulario    │
│  intentos_validacion ← Rate limiting               │
└─────────────────────────────────────────────────────┘
                       ▲
                       │ Script local (service role key)
┌─────────────────────────────────────────────────────┐
│              EQUIPO COCO (local)                    │
│                                                     │
│  npm run import  ← Carga Excel → Supabase + URLs   │
│  npm run export  ← Descarga resultados → CSV       │
└─────────────────────────────────────────────────────┘
```

---

## Flujo de autenticación del enlace

```
URL: https://ccss-utle-prod.netlify.app/utle?t=<uuid-v4>

1. Servidor lee el parámetro ?t=
2. Busca en registros WHERE token = t
3. Valida: token existe + no expirado + estado = PENDIENTE
4. Si todo OK: renderiza el formulario con datos del paciente
5. Si falla: muestra mensaje de error apropiado
```

**El `id_registro` nunca viaja en la URL.** Solo el token UUID (122 bits de entropía).

---

## Flujo de validación de identidad (Paso 2)

```
Cliente                          Servidor
  │                                  │
  │── POST /api/validate-identity ──▶│
  │   { token, digits }              │
  │                                  │── resuelve token → id_registro
  │                                  │── cuenta intentos fallidos previos
  │                                  │── si ≥ 3 intentos: devuelve locked
  │                                  │── compara digits con ultimos_4_asegurado
  │                                  │   (NUNCA sale de la BD hacia el cliente)
  │                                  │── registra intento en intentos_validacion
  │◀── { valid, attempts_remaining } │
```

---

## Base de datos

### Tabla `registros`

| Columna | Tipo | Descripción |
|---|---|---|
| `id_registro` | TEXT PK | Identificador único del paciente |
| `nombre_paciente` | TEXT | Nombre completo |
| `numero_asegurado` | TEXT | Número de asegurado CCSS |
| `telefono` | TEXT | Teléfono (opcional) |
| `correo` | TEXT | Correo electrónico |
| `especialidad` | TEXT | Especialidad médica |
| `centro_medico` | TEXT | Hospital o clínica asignada |
| `tipo_atencion` | TEXT | `consulta` / `cirugia` / `procedimiento` |
| `nombre_servicio` | TEXT | Nombre del procedimiento (si aplica) |
| `lateralidad` | TEXT | Lateralidad (solo cirugía) |
| `ultimos_4_asegurado` | TEXT | Últimos 4 dígitos — **NUNCA se expone al frontend** |
| `token` | TEXT | UUID único para la URL del paciente |
| `link_expires_at` | TIMESTAMPTZ | Expiración del enlace (30 días por defecto) |
| `estado` | TEXT | Estado actual del registro |
| `campana_id` | TEXT | Identificador de la campaña de envío |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Última modificación (auto) |

**Estados válidos:** `PENDIENTE`, `ACTIVO`, `NO_AUTORIZO`, `NO_VERIFICADO`, `INFO_INCORRECTA`, `DEPURADO_YA_ATENDIDO`, `DEPURADO_YA_PROGRAMADO`, `DEPURADO_RENUNCIA`

### Tabla `respuestas`

Almacena las respuestas paso a paso del formulario. Una respuesta por intento de un paciente.

| Columna | Descripción |
|---|---|
| `id_registro` | FK a registros |
| `canal` | `correo` (fijo en este sistema) |
| `paso_1_consentimiento` | `si_autorizo` / `no_autorizo` |
| `paso_2_verificacion` | `exitosa` / `fallida` |
| `paso_2_intentos` | Número de intentos usados |
| `paso_3_info_correcta` | `si` / `no` |
| `paso_4_desea_continuar` | `si` / `no_ya_realizada` / `no_ya_programada` / `no_ya_no_deseo` |
| `motivo_retiro` | Motivo si no desea continuar |
| `paso_5a_flexibilidad_centro` | `si` / `no` |
| `paso_5b_condiciones_asistir` | `si` / `no` |
| `paso_5b_motivo_no_asistir` | Motivo si no puede asistir |
| `paso_6_medio_contacto` | `llamada` / `whatsapp` / `correo` / `sms` / `cualquiera` |
| `estado_final` | Estado resultante |
| `completado` | `true` si llegó al final |
| `paso_abandono` | Número de paso donde abandonó |

### Tabla `intentos_validacion`

Rate limiting para la validación de identidad. Máximo 3 intentos fallidos por registro.

---

## API Routes

### `POST /api/validate-identity`

**Request:**
```json
{ "token": "uuid-del-enlace", "digits": "1234" }
```

**Response exitosa:**
```json
{ "valid": true }
```

**Response fallida:**
```json
{ "valid": false, "attempts_remaining": 2, "locked": false }
```

**Response bloqueada (3 intentos):**
```json
{ "valid": false, "attempts_remaining": 0, "locked": true }
```

---

### `POST /api/survey-response`

**Request:** objeto `FormAnswers` completo con todas las respuestas acumuladas y `estado_final`.

**Response:**
```json
{ "ok": true }
```

---

## Seguridad

| Medida | Implementación |
|---|---|
| URL opaca | Token UUID v4 (122 bits de entropía) |
| ID secuencial oculto | `id_registro` nunca en URL ni en respuestas API al cliente |
| Validación de identidad | Solo en servidor, `ultimos_4_asegurado` nunca sale de la BD |
| Rate limiting | Máximo 3 intentos de validación por registro |
| Expiración de enlaces | 30 días desde la generación |
| Protección de BD | RLS habilitado en todas las tablas, solo `service_role` bypassa |
| Clave de servicio | `SUPABASE_SERVICE_ROLE_KEY` solo en servidor, nunca en cliente |
| Caché deshabilitado | `force-dynamic` + `cache: 'no-store'` en consultas de servidor |

---

## Variables de entorno

### Requeridas (todos los ambientes)

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (solo servidor) |

### Opcionales

| Variable | Descripción |
|---|---|
| `COCO_WEBHOOK_URL` | URL para reenviar respuestas a sistema CoCo |
| `COCO_WEBHOOK_SECRET` | Token Bearer para el webhook |
| `ADMIN_PASSWORD` | Contraseña del panel administrativo |
| `LINK_EXPIRATION_DAYS` | Días de validez del enlace (default: 30) |

---

## Estructura de archivos

```
CCSS/
├── app/
│   ├── layout.tsx              # Layout global (accesibilidad)
│   ├── globals.css             # Estilos globales + dark mode + alto contraste
│   ├── utle/
│   │   └── page.tsx            # Página principal del formulario (Server Component)
│   └── api/
│       ├── validate-identity/  # Validación de identidad
│       └── survey-response/    # Guardado de respuestas
├── components/
│   ├── UTLEForm.tsx            # Máquina de estado del formulario (Client Component)
│   ├── ProgressBar.tsx         # Barra de progreso
│   ├── StepOption.tsx          # Botón de opción con auto-avance
│   ├── ConfirmModal.tsx        # Modal de confirmación destructiva
│   ├── AnswersSummary.tsx      # Panel lateral de respuestas
│   ├── SummaryScreen.tsx       # Pantalla de resumen antes de enviar
│   ├── ClosingMessage.tsx      # Mensaje de cierre
│   ├── AccessibilityMenu.tsx   # Menú de accesibilidad flotante
│   └── steps/
│       ├── Step1Consent.tsx
│       ├── Step2Identity.tsx
│       ├── Step3Case.tsx
│       ├── Step4Continue.tsx
│       ├── Step5Conditions.tsx
│       └── Step6Contact.tsx
├── lib/
│   ├── types.ts                # Tipos compartidos
│   ├── accessibility-context.tsx # Contexto de accesibilidad
│   └── supabase/
│       ├── server.ts           # Cliente Supabase (servidor, service role)
│       └── client.ts           # Cliente Supabase (cliente, publishable key)
├── scripts/
│   ├── import-patients.js      # Importar CSV → Supabase + generar URLs
│   ├── export-results.js       # Exportar resultados → CSV
│   └── pacientes_template.csv  # Plantilla de formato de importación
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial.sql     # Schema inicial
│   │   └── 002_campana.sql     # Columna campana_id
│   └── seed.sql                # Datos de prueba
├── docs/                       # Esta documentación
├── netlify.toml                # Configuración de deploy
└── tailwind.config.ts          # Colores CCSS + dark mode
```
