# Minuta de Reunión de Trabajo
**Proyecto:** Plataforma de Actualización de Lista de Espera — UTLE  
**Contrato:** 2026LE-000001-2299  
**Fecha:** Jueves 21 de mayo de 2026  
**Modalidad:** [Presencial / Virtual — confirmar]  
**Versión:** 1.1 | Actualizado: 18 de mayo de 2026

---

## Participantes

| Nombre | Organización | Cargo | Correo |
|--------|-------------|-------|--------|
| Andres Zapata | Coco Tech AI | [Cargo] | a.zapata@cocotech.ai |
| Ing. Mariam Castillo | CCSS — UTLE | Ing. en Sistemas | gm_utle_gelisespera@ccss.sa.cr |

---

## Agenda propuesta (3 horas)

| Hora | Bloque | Tema |
|------|--------|------|
| 00:00 | Bloque 1 (45 min) | Demostración de la plataforma — flujo completo en vivo |
| 00:45 | Bloque 2 (60 min) | Revisión de documentación técnica |
| 01:45 | Bloque 3 (30 min) | Seguridad y manejo de datos |
| 02:15 | Bloque 4 (30 min) | Procedimientos operativos y herramientas |
| 02:45 | Bloque 5 (15 min) | Pendientes, acuerdos y firmas |

---

## Bloque 1 — Demostración en vivo

**Links de prueba (válidos 3 días, PIN: 1234):**

| Registro | Tipo | URL |
|----------|------|-----|
| TEST-AZ-001 | Consulta | https://ccss-utle-preprod.netlify.app/utle?t=124ddcda-9589-4c32-b4d5-c18b44c606ae |
| TEST-AZ-002 | Cirugía | https://ccss-utle-preprod.netlify.app/utle?t=59d5a637-a9f7-47bf-b01c-053f1f37ff9f |
| TEST-AZ-003 | Procedimiento | https://ccss-utle-preprod.netlify.app/utle?t=30abc68b-c0af-44bc-8dd1-117fd4864cef |

**Puntos a mostrar:**
- [ ] Flujo completo de los 6 pasos (consulta, cirugía, procedimiento)
- [ ] Verificación de identidad con PIN
- [ ] Pantallas de cierre según decisión del paciente
- [ ] Plantilla del correo electrónico (PDF: `scripts/plantilla_correo_ccss_v2.pdf`)
- [ ] Arquitectura multicanal: WhatsApp → Llamada → Correo

---

## Bloque 2 — Revisión de documentos

Documentos a revisar y validar en la reunión:

| # | Documento | Acción |
|---|-----------|--------|
| 1 | Ficha de alcance del sistema | Revisar y firmar |
| 2 | Flujo de datos y estados del paciente | Revisar |
| 3 | Ficha de seguridad y manejo de datos | Revisar — **definir política de retención** |
| 4 | Manual operativo (SOP) | Revisar procedimientos |

---

## Puntos críticos a definir en la reunión

| # | Punto | Por qué es urgente |
|---|-------|--------------------|
| 1 | **Política de retención de datos** | Requerida antes de la primera campaña real. ¿Cuánto tiempo se guardan los registros? |
| 2 | **Cuentas Google para Looker Studio** | Para activar el dashboard de monitoreo en tiempo real |
| 3 | **Fecha y volumen del primer lote CSV** | Necesario para prueba piloto en semana del 29 de mayo |
| 4 | **Confirmación del número WhatsApp Business** | Bloqueante para el canal WhatsApp |
| 5 | **URL de producción definitiva** | Para configurar antes del despliegue a producción |

---

## Acuerdos tomados

| # | Acuerdo | Responsable | Fecha compromiso |
|---|---------|-------------|-----------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

---

## Pendientes al cierre

| # | Pendiente | Responsable | Fecha límite | Estado |
|---|-----------|-------------|-------------|--------|
| 1 | Configuración DNS correo institucional | TI CCSS (vía Ing. Mariam Carvajal) | 29 mayo | En gestión |
| 2 | Manual de marca CCSS | UTLE | 29 mayo | ✓ Recibido |
| 3 | Número WhatsApp Business | UTLE | 29 mayo | En espera |
| 4 | Primer lote CSV de pacientes | UTLE | 5 junio | Abierto |
| 5 | Cuentas Google — acceso Looker Studio | UTLE (Ing. Castillo) | 28 mayo | Abierto |
| 6 | Política de retención de datos | UTLE / Jurídico | 28 mayo | Abierto |
| 7 | Despliegue producción | Coco Tech | 12 junio | Pendiente |

---

## Observaciones de la reunión

_[Espacio para notas durante la sesión]_

---

## Firmas de conformidad

| | |
|--|--|
| **Andres Zapata** | **Ing. Mariam Castillo** |
| Coco Tech AI | CCSS — UTLE |
| Fecha: 21/05/2026 | Fecha: 21/05/2026 |

---

*Minuta elaborada por Coco Tech AI — para validación y firma de ambas partes*
