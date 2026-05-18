# Manual Operativo — SOP
**Proyecto:** Plataforma de Actualización de Lista de Espera — UTLE  
**Contrato:** 2026LE-000001-2299  
**Versión:** 1.0 | Fecha: 18 de mayo de 2026  

> Este manual describe los procedimientos operativos para ejecutar una campaña de depuración. La operación de la plataforma está a cargo de **Coco Technology**. La UTLE coordina el proceso y provee los datos.

---

## Procedimiento 1 — Preparar el archivo de pacientes (CSV)

**Responsable:** UTLE  
**Frecuencia:** Por campaña

### Pasos:
1. Exportar desde el sistema de listas de espera los pacientes a contactar
2. Asegurarse de que el archivo incluya las columnas requeridas (ver documento 02 — Flujo de Datos)
3. Verificar que los correos electrónicos estén correctos — un correo inválido implica que el paciente no recibirá su enlace
4. Verificar que `ultimos_4_asegurado` corresponda exactamente a los últimos 4 dígitos del número de asegurado **incluyendo ceros** (ej: `0789`)
5. Enviar el archivo a Coco Technology para su importación

### Volumen esperado:
- Campaña inicial: ~100,000 pacientes
- Proyección total: hasta 1,500,000 pacientes

---

## Procedimiento 2 — Importar pacientes a la plataforma

**Responsable:** Coco Technology  
**Tiempo estimado:** Variable según volumen

### Pasos:
1. Recibir el archivo CSV validado de la UTLE
2. Ejecutar el script de importación:
   ```bash
   node --env-file=.env.local scripts/import-patients.js pacientes.csv https://[URL-produccion] --campana [ID-campaña]
   ```
   Ejemplo de ID de campaña: `2026-05_HospMexico`
3. El script valida cada fila, importa los registros y genera un archivo `pacientes_urls.csv` con los enlaces personalizados
4. Compartir el archivo de URLs con la UTLE para registro y trazabilidad

---

## Procedimiento 3 — Enviar correos a los pacientes

**Responsable:** Coco Technology  
**Prerrequisito:** Archivo de URLs generado en el Procedimiento 2

### Pasos:
1. Importar la lista de pacientes en la plataforma de correos con los campos personalizados (nombre + enlace único)
2. Configurar el correo remitente: `gm_utle_gelisespera@ccss.sa.cr`
3. Seleccionar la plantilla aprobada por la UTLE
4. Programar o ejecutar el envío
5. Monitorear las tasas de entrega, apertura y rebote

### Tiempos clave:
- Los enlaces son válidos por **3 días** desde su generación
- Se recomienda enviar el correo dentro de las 24 horas posteriores a la importación

---

## Procedimiento 4 — Monitorear resultados

**Responsable:** Coco Technology (infraestructura del dashboard) + UTLE (consulta en tiempo real)

### Canal de seguimiento: Looker Studio

La UTLE tiene acceso a un **dashboard en tiempo real** desarrollado en Looker Studio, conectado directamente a la base de datos de la plataforma. No se requiere acceso técnico a Supabase.

El dashboard incluye:

| Vista | Descripción |
|-------|-------------|
| Resumen de campaña | Total de pacientes por estado en tiempo real |
| Tasa de completación | Porcentaje de pacientes que finalizaron el flujo |
| Tasa de apertura de correos | Datos de la plataforma de envío |
| Pacientes por estado | Desglose: ACTIVO, DEPURADO_*, NO_VERIFICADO, PENDIENTE, etc. |
| Motivos de retiro | Distribución de los motivos registrados en Paso 4 |
| Motivos de no asistencia | Distribución de los motivos registrados en Paso 5 |
| Detalle por paciente | Hipervínculo a Google Sheets con tabla completa exportable |

### Acceso:
- **UTLE:** Acceso de solo lectura al dashboard de Looker Studio
- **Coco Technology:** Administración del dashboard y conexión de datos
- **Google Sheets:** Tabla de datos detallada con hipervínculos desde Looker Studio para descarga y análisis adicional

### Estado del dashboard:
- [PENDIENTE — definir métricas prioritarias con Mariam Castillo]
- [PENDIENTE — confirmar cuentas de Google con acceso al dashboard]

---

## Procedimiento 5 — Atender incidencias de pacientes

**Responsable:** UTLE recibe, Coco Technology resuelve

### Casos frecuentes:

| Situación reportada | Acción |
|--------------------|--------|
| "El link no me funciona" | Verificar si expiró (3 días). Si expiró, Coco Technology genera nuevo token. |
| "Ingresé mal el PIN 3 veces y me bloqueó" | Coco Technology restablece los intentos en BD. |
| "No recibí el correo" | Verificar el correo en el CSV. Si es correcto, reenviar. |
| "Mis datos están incorrectos" | El estado queda como INFO_INCORRECTA. Revisar el expediente en sistema de listas de espera. |

### Contacto técnico:
**Andres Zapata — Coco Technology**  
a.zapata@cocotech.ai

---

## Procedimiento 6 — Cierre de campaña

**Responsable:** Coco Technology + UTLE

### Pasos:
1. Al vencer los enlaces (3 días), los pacientes PENDIENTE no podrán completar el flujo
2. Coco Technology exporta el reporte final de la campaña con todos los estados
3. UTLE revisa y toma acciones según cada estado (depurar de lista, verificar, reagendar, etc.)
4. Se archiva el reporte como evidencia del proceso

---

*Documento elaborado por Coco Technology en coordinación con la UTLE — CCSS*
