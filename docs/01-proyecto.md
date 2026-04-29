# CCSS UTLE — Documentación del Proyecto

## Descripción general

**Cliente:** Caja Costarricense de Seguro Social (CCSS) — Unidad Técnica de Listas de Espera (UTLE)
**Desarrollado por:** COCO Tech AI
**Contacto CoCo:** Andres David Zapata Cano — a.zapata@cocotech.ai
**Fecha límite:** 15 de junio de 2026

---

## Objetivo

Depurar **100,000 registros** de pacientes en lista de espera antes del 15 de junio de 2026.

La depuración consiste en contactar a cada paciente y obtener su decisión sobre la atención pendiente:
- ¿Sigue necesitando la atención?
- ¿Ya fue atendido en otro centro?
- ¿Desea retirarse de la lista?
- ¿Puede asistir si se le asigna una cita próximamente?

---

## Canales de contacto

El sistema de depuración opera en 3 canales, en orden de prioridad:

```
1. WhatsApp (chatbot automatizado)
2. Llamada telefónica (voicebot)
3. Correo electrónico ← este sistema
```

Este proyecto cubre el **canal de correo electrónico**: el paciente recibe un correo con un enlace personalizado, completa un formulario de 6 pasos, y el resultado queda registrado automáticamente.

---

## Flujo general del sistema

```
UTLE entrega Excel de pacientes
         ↓
CoCo importa datos a Supabase (script)
         ↓
Script genera URLs personalizadas por paciente
         ↓
URLs se cargan en herramienta de email marketing
         ↓
Paciente recibe correo con su enlace único
         ↓
Paciente completa formulario (6 pasos)
         ↓
Respuesta se guarda en Supabase
         ↓
CoCo exporta resultados a CSV / Google Sheets
         ↓
UTLE recibe resultados para actualizar sus sistemas
```

---

## Tipos de resultado por paciente

| Estado final | Descripción |
|---|---|
| `ACTIVO` | Completó el formulario, desea continuar en lista |
| `DEPURADO_YA_ATENDIDO` | Ya recibió la atención, puede retirarse |
| `DEPURADO_YA_PROGRAMADO` | Ya tiene la atención programada |
| `DEPURADO_RENUNCIA` | No desea continuar, solicita retiro |
| `INFO_INCORRECTA` | Los datos del sistema no coinciden con los suyos |
| `NO_AUTORIZO` | No autorizó el procesamiento de datos |
| `NO_VERIFICADO` | No pudo verificar su identidad (máx. 3 intentos) |

---

## Formulario — 6 pasos

| Paso | Pregunta | Opciones |
|---|---|---|
| 1 | Consentimiento de datos | Sí autorizo / No autorizo |
| 2 | Verificación de identidad | Últimos 4 dígitos del número de asegurado |
| 3 | Confirmación de datos clínicos | Sí es correcta / No es correcta |
| 4 | Decisión sobre la atención | Continúa / Ya realizada / Ya programada / Renuncia |
| 5 | Disponibilidad y flexibilidad | ¿Puede asistir? ¿Acepta otro centro? |
| 6 | Preferencia de contacto futuro | Llamada / WhatsApp / Correo / SMS / Cualquiera |

El paciente puede abandonar en cualquier paso. El sistema registra hasta dónde llegó.

---

## Identificación de campañas

Cada envío de correo es una **campaña**. Los registros se etiquetan con un `campana_id` para poder:
- Medir tasa de respuesta por campaña
- Filtrar resultados por hospital o especialidad
- Cruzar datos con fechas de envío

**Formato recomendado:**
```
YYYY-MM-DD_Hospital_Especialidad
Ejemplo: 2026-05-01_HospMexico_Cardiologia
```

---

## Ambientes

| Ambiente | URL | Rama GitHub | Uso |
|---|---|---|---|
| Preprod | ccss-utle-preprod.netlify.app | `develop` | Pruebas e iteraciones |
| Producción | ccss-utle-prod.netlify.app | `main` | Campañas reales |

**Regla:** ningún cambio va directamente a `main`. Todo pasa por `develop` y se valida en preprod primero.

---

## Repositorio

**GitHub:** https://github.com/landrex90/ccss_utle
- Rama `develop` — trabajo en curso
- Rama `main` — producción estable
