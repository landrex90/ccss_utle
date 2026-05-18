# Estado del Proyecto y Plan de Ejecución
**Proyecto:** Plataforma de Actualización de Lista de Espera — UTLE  
**Contrato:** 2026LE-000001-2299  
**Proveedor:** Consorcio Salud Digital – Coco Technology  
**Acta de inicio:** 15 de mayo de 2026  
**Fecha objetivo de operación:** 26 de junio de 2026  
**Semanas disponibles:** 6  
**Documento actualizado:** 18 de mayo de 2026  

---

## Canales del proyecto (Multicanal)

| Canal | Estado |
|-------|--------|
| Correo electrónico + plataforma web | ✅ Completado — en preproducción |
| Voicebot (llamada telefónica) | ✅ Completado — operativo |
| WhatsApp | ⏳ Pendiente de desarrollo |

---

## Resumen ejecutivo

A 3 días del inicio formal del contrato, la solución multicanal tiene un avance técnico estimado del **70%**. Los canales de correo/web y voicebot están completos. El canal de WhatsApp está pendiente de desarrollo. Los pendientes adicionales son de coordinación institucional (dominio de correo, datos de pacientes, ambiente de producción).

---

## Estado por componente

### ✅ COMPLETADO

| Componente | Detalle |
|------------|---------|
| Plataforma web | Flujo completo de 6 pasos desarrollado y desplegado en preproducción |
| Flujo Consulta v3.1 | Textos y lógica aprobados por cliente |
| Flujo Cirugía v3.1 | Textos y lógica aprobados por cliente |
| Flujo Procedimiento v3.1 | Textos y lógica aprobados por cliente |
| Seguridad | Token único por paciente, verificación de identidad, token de sesión por paso, expiración de links |
| Base de datos | Esquema completo en Supabase con todos los campos v3.1 y estados |
| Script de importación | Procesamiento de CSV con validación, generación de tokens y exportación de URLs |
| Plantilla de correo | Diseño HTML aprobado por cliente, horario y textos correctos |
| Logo institucional | Logo oficial CCSS integrado en app y plantilla |
| Ambiente preproducción | Desplegado en https://ccss-utle-preprod.netlify.app |
| Identidad en app | "Plataforma desarrollada por Coco Tech AI" en footer |
| Documentación técnica | 5 documentos base elaborados |

---

### 🔄 EN PROGRESO

| Componente | Estado | Responsable |
|------------|--------|-------------|
| Documentación técnica formal | En elaboración — reunión pendiente con Ing. Mariam Castillo | Coco Technology + UTLE |
| Correo institucional `gm_utle_gelisespera@ccss.sa.cr` | Solicitud en preparación para TI CCSS vía Ing. Mariam Carvajal | Coco Technology |
| Dashboard Looker Studio | Pendiente de definir métricas y cuentas de acceso | Coco Technology |

---

### 🔴 POR DESARROLLAR

| Componente | Detalle | Responsable | Semana objetivo |
|------------|---------|-------------|----------------|
| Canal WhatsApp | Implementar el flujo de 6 pasos en formato conversacional vía WhatsApp Business API | Coco Technology | Semana 2–5 |
| Integración WhatsApp ↔ Supabase | Conectar respuestas de WhatsApp con la misma base de datos del canal web | Coco Technology | Semana 3–5 |
| Validación de identidad por WhatsApp | Verificación de los últimos 4 dígitos del asegurado en flujo conversacional | Coco Technology | Semana 3–4 |
| Pruebas canal WhatsApp | Prueba end-to-end con números de prueba antes de campaña real | Coco Technology + UTLE | Semana 5 |

---

### ⏳ PENDIENTE

| Componente | Bloqueado por | Responsable | Semana objetivo |
|------------|--------------|-------------|----------------|
| Configuración DNS dominio correo | TI CCSS (gestión Ing. Mariam Carvajal) | CCSS | Semana 2–3 |
| Verificación Mailchimp dominio | DNS CCSS configurado | Coco Technology | Semana 3 |
| Manual de marca CCSS | Oficio pendiente de UTLE | CCSS | Semana 2 |
| Ajustes de identidad visual (si aplica) | Manual de marca | Coco Technology | Semana 3 |
| Dashboard Looker Studio | Cuentas Google + métricas UTLE | Coco Technology | Semana 3–4 |
| Datos primer lote de pacientes (CSV) | UTLE prepara exportación | CCSS — UTLE | Semana 3–4 |
| Prueba piloto con datos reales | CSV + correo habilitado | Coco Technology + UTLE | Semana 4 |
| Ambiente de producción (URL definitiva) | Validación UTLE + aprobación | Coco Technology | Semana 4–5 |
| Primera campaña real | Todo lo anterior | Coco Technology + UTLE | Semana 5–6 |
| Política de retención de datos | Decisión institucional UTLE | CCSS — UTLE | Semana 2–3 |

---

## Cronograma de 6 semanas

| Semana | Fechas | Hitos clave |
|--------|--------|-------------|
| **Sem 1** | 15–21 mayo | ✅ Acta de inicio · ✅ Plataforma web/correo preprod · Reunión documentación Ing. Castillo · Solicitud DNS a TI CCSS · **Inicio diseño flujo WhatsApp** |
| **Sem 2** | 22–28 mayo | TI CCSS aplica DNS · Manual de marca · Política retención · **Desarrollo WhatsApp: consentimiento + verificación identidad** |
| **Sem 3** | 29 mayo–4 jun | Verificación dominio correo · Dashboard Looker Studio v1 · **Desarrollo WhatsApp: pasos 3–6 + integración Supabase** |
| **Sem 4** | 5–11 jun | CSV primer lote · Prueba piloto canal web/correo · **Pruebas canal WhatsApp** · Producción web |
| **Sem 5** | 12–18 jun | Ajustes post-piloto · Producción todos los canales · Capacitación UTLE · **WhatsApp listo para campaña** |
| **Sem 6** | 19–26 jun | Primera campaña multicanal real · Monitoreo en tiempo real · Entrega formal documentación |

---

## Ruta crítica

Los tres elementos que pueden retrasar la primera campaña si no se resuelven a tiempo:

1. **DNS de correo** — Si TI CCSS tarda más de 2 semanas, el primer envío se retrasa en cadena
2. **CSV de pacientes** — Necesita estar listo en semana 3–4 para tiempo de prueba
3. **Aprobación producción** — La URL definitiva debe estar confirmada antes de importar pacientes reales

---

## Escenario de riesgo

Si el DNS no queda resuelto antes del **5 de junio**, se recomienda evaluar con la UTLE la posibilidad de lanzar la primera campaña desde un dominio temporal verificado (ej. `@cocotech.ai`) y migrar al dominio institucional en la segunda campaña.

---

*Documento elaborado por Coco Technology — Actualizar semanalmente*
