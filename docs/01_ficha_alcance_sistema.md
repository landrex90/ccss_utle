# Ficha de Alcance del Sistema
**Proyecto:** Plataforma de Actualización de Lista de Espera — UTLE  
**Contrato:** 2026LE-000001-2299  
**Proveedor:** Consorcio Salud Digital – Coco Technology  
**Fecha de inicio:** 15 de mayo de 2026  
**Versión del documento:** 1.0  
**Fecha:** 18 de mayo de 2026  

---

## 1. Descripción general

La plataforma es un sistema web institucional desarrollado para la **Unidad Técnica de Listas de Espera (UTLE)** de la Caja Costarricense de Seguro Social (CCSS). Su propósito es permitir la **depuración y actualización de expedientes de pacientes** que se encuentran en lista de espera para consultas, cirugías o procedimientos médicos.

El proceso se realiza de forma digital, mediante un enlace personalizado enviado al correo electrónico de cada paciente.

---

## 2. ¿Qué hace la plataforma?

| Función | Descripción |
|---------|-------------|
| Importación de pacientes | El equipo UTLE carga un archivo CSV con los datos de los pacientes a contactar |
| Generación de enlaces únicos | El sistema crea un enlace personal e intransferible por paciente, con vigencia de 3 días |
| Envío de notificaciones | Se envía un correo electrónico al paciente con su enlace personalizado |
| Verificación de identidad | El paciente confirma su identidad con los últimos 4 dígitos de su número de asegurado |
| Actualización de información | El paciente responde un cuestionario de 6 pasos sobre su situación actual |
| Registro de resultados | Las respuestas quedan almacenadas en base de datos para consulta del equipo UTLE |

---

## 3. ¿Qué NO hace la plataforma?

- No agenda ni modifica citas médicas
- No accede a expedientes clínicos del EDUS ni sistemas internos de la CCSS
- No solicita contraseñas, información bancaria ni datos de pago
- No comparte datos con terceros fuera del contrato
- No permite modificar información clínica registrada en la CCSS

---

## 4. Tipos de atención cubiertos

| Tipo | Descripción |
|------|-------------|
| Consulta | Citas de consulta externa pendientes en lista de espera |
| Cirugía | Procedimientos quirúrgicos pendientes |
| Procedimiento | Procedimientos médicos no quirúrgicos pendientes |

---

## 5. Entornos del sistema

| Entorno | URL | Propósito |
|---------|-----|-----------|
| Preproducción | https://ccss-utle-preprod.netlify.app | Pruebas y validación |
| Producción | [PENDIENTE — confirmar URL definitiva] | Uso oficial con pacientes reales |

---

## 6. Partes involucradas

| Rol | Persona / Unidad | Contacto |
|-----|-----------------|---------|
| Administrador técnico | Coco Technology | a.zapata@cocotech.ai |
| Representante legal del contrato | Mariam Naranjo Bustos | comercial.cr@cocotech.ai |
| Contraparte institucional UTLE | Ing. Mariam Castillo — Ing. en Sistemas | gm_utle_gelisespera@ccss.sa.cr |

---

## 7. Tecnologías utilizadas

| Componente | Tecnología |
|------------|-----------|
| Frontend / Aplicación web | Next.js 14 (React) |
| Base de datos | Supabase (PostgreSQL) |
| Infraestructura / Hosting | Netlify |
| Envío de correos | Plataforma de comunicaciones masivas (Mailchimp) |
| Dashboard de resultados | Looker Studio + Google Sheets (acceso en tiempo real para UTLE) |

---

*Documento elaborado por Coco Technology en coordinación con la UTLE — CCSS*
