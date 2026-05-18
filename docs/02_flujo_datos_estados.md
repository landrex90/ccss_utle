# Flujo de Datos y Estados del Paciente
**Proyecto:** Plataforma de Actualización de Lista de Espera — UTLE  
**Contrato:** 2026LE-000001-2026  
**Versión:** 1.0 | Fecha: 18 de mayo de 2026  

---

## 1. Flujo de cascada multicanal

```
Paciente importado al sistema
        ↓
1° Canal: WhatsApp
  → Se envía mensaje con enlace o flujo conversacional
  → Si completa → FIN (canal_completado = 'whatsapp')
  → Si no responde en el mismo día o el siguiente →
        ↓
2° Canal: Llamada voicebot
  → Llamada automática al número del paciente
  → Si completa → FIN (canal_completado = 'llamada')
  → Si no contesta o no completa →
        ↓
3° Canal: Correo electrónico
  → Se envía correo con enlace personalizado
  → Si completa → FIN (canal_completado = 'correo')
  → Si no responde antes del vencimiento → PENDIENTE sin respuesta
```

> El orden de los canales es configurable por campaña (`canal_orden`).  
> Cada evento queda registrado con timestamp exacto en la base de datos.

---

## 2. Flujo general del proceso (dentro de cada canal)

```
[UTLE prepara CSV]
        ↓
[Importación a plataforma]
  → Se genera token único por paciente
  → Se registra fecha de expiración (3 días)
  → Estado inicial: PENDIENTE
        ↓
[Envío de correo al paciente]
  → Correo desde: gm_utle_gelisespera@ccss.sa.cr
  → Contiene enlace personal con token
        ↓
[Paciente accede al enlace]
  → Sistema valida que el token existe y no ha expirado
        ↓
[Paso 1 — Consentimiento]
  → Paciente autoriza el uso de su información
  → Si no autoriza → Estado: NO_AUTORIZO → Fin
        ↓
[Paso 2 — Verificación de identidad]
  → Paciente ingresa los últimos 4 dígitos de su número de asegurado
  → Máximo 3 intentos fallidos
  → Si falla → Estado: NO_VERIFICADO → Fin
        ↓
[Paso 3 — Confirmación de datos clínicos]
  → Se muestran los datos de su atención pendiente
  → Paciente confirma que la información es correcta
  → Si no coincide → Estado: INFO_INCORRECTA → Fin
        ↓
[Paso 4 — Decisión sobre la atención]
  → Opciones:
    a) Sí desea continuar → Continúa al Paso 5
    b) Ya no desea la atención → Selecciona motivo → Estado: DEPURADO_RENUNCIA → Fin
    c) Ya fue atendido → Estado: DEPURADO_YA_ATENDIDO o DEPURADO_YA_PROGRAMADO → Fin
    d) No está asegurado → Estado: NO_ASEGURADO → Fin
        ↓
[Paso 5 — Disponibilidad]
  → 5a: ¿Acepta atención en otro centro de la CCSS?
  → 5b: ¿Puede asistir si se le asigna cita próximamente?
        ↓
[Paso 6 — Preferencia de contacto]
  → Paciente indica medio preferido de comunicación
        ↓
[Estado final: ACTIVO]
  → Paciente permanece activo en lista de espera
  → Todas las respuestas quedan registradas en base de datos
```

---

## 2. Estructura del CSV de importación

| Campo | Requerido | Descripción | Ejemplo |
|-------|-----------|-------------|---------|
| `id_registro` | No | Identificador interno (se genera automáticamente si no se indica) | REG-000001 |
| `nombre_paciente` | Sí | Nombre completo del paciente | María Pérez Rodríguez |
| `numero_asegurado` | Sí | Número de asegurado completo | 1-0234-0789 |
| `ultimos_4_asegurado` | Sí | Últimos 4 dígitos del número de asegurado | 0789 |
| `correo` | Sí | Correo electrónico del paciente | maria@ejemplo.com |
| `centro_medico` | Sí | Nombre del centro médico | Hospital México |
| `tipo_atencion` | Sí | Tipo de atención: `consulta`, `cirugia` o `procedimiento` | cirugia |
| `especialidad` | No | Especialidad médica | Ortopedia |
| `nombre_servicio` | No | Nombre del servicio | Servicio de Rodilla |
| `procedimiento` | No | Nombre del procedimiento | Artroplastia de rodilla |
| `lateralidad` | No | Lateralidad si aplica | Derecha |
| `tipo_consulta` | No | Tipo de consulta si aplica | Primera vez |
| `fecha_cita` | No | Fecha de cita asignada si existe | 2026-06-15 |
| `hora_cita` | No | Hora de la cita | 08:00 |
| `telefono` | No | Teléfono de contacto | 8888-9999 |
| `campana_id` | No | Identificador de campaña | 2026-05-HospMexico |

---

## 3. Estados posibles de un paciente

| Estado | Significado | ¿Requiere seguimiento? |
|--------|-------------|----------------------|
| `PENDIENTE` | No ha completado el proceso aún | Sí — reenviar si no responde antes del vencimiento |
| `ACTIVO` | Completó el flujo y desea continuar en lista de espera | No |
| `NO_AUTORIZO` | No autorizó el uso de su información en el Paso 1 | A criterio de UTLE |
| `NO_VERIFICADO` | Falló 3 veces la verificación de identidad | Sí — revisar datos del expediente |
| `INFO_INCORRECTA` | Sus datos clínicos no coinciden con los registrados | Sí — revisar expediente |
| `DEPURADO_RENUNCIA` | Ya no desea la atención | No — depurar de lista |
| `DEPURADO_YA_ATENDIDO` | Indica haber sido atendido por otra vía | Sí — verificar en sistema |
| `DEPURADO_YA_PROGRAMADO` | Ya tiene cita programada | Sí — verificar en sistema |
| `NO_ASEGURADO` | Indica que ya no está asegurado | Sí — verificar condición de aseguramiento |

---

## 4. Motivos de retiro registrados (Paso 4)

| Valor | Descripción |
|-------|-------------|
| `ya_no_deseo_la_atencion` | Ya no deseo la atención |
| `acudi_ccss` | Acudí a otro centro de la CCSS |
| `acudi_privado` | Acudí a otro centro médico privado |
| `ya_no_necesito` | Ya no necesito la atención |
| `contraindicacion_medica` | Contraindicación médica |
| `fallecimiento` | Fallecimiento |

---

## 5. Motivos de no asistencia registrados (Paso 5)

| Valor | Descripción |
|-------|-------------|
| `problemas_salud` | Problemas de salud |
| `hospitalizacion` | Hospitalización o recuperación médica |
| `falta_transporte` | Falta de transporte o traslado |
| `falta_acompanante` | Falta de acompañante o situación familiar |
| `obligaciones` | Obligaciones laborales, académicas o legales |
| `problemas_economicos` | Problemas económicos |
| `fuera_pais` | Fuera del país o de la zona |
| `decision_personal` | Decisión personal |
| `otro_motivo` | Otro motivo |

---

*Documento elaborado por Coco Technology en coordinación con la UTLE — CCSS*
