# Ficha de Seguridad y Manejo de Datos
**Proyecto:** Plataforma de Actualización de Lista de Espera — UTLE  
**Contrato:** 2026LE-000001-2299  
**Versión:** 1.0 | Fecha: 18 de mayo de 2026  

---

## 1. Datos personales que maneja la plataforma

| Dato | Origen | Uso |
|------|--------|-----|
| Nombre completo | CSV importado por UTLE | Personalización del mensaje y resumen |
| Número de asegurado | CSV importado por UTLE | Verificación de identidad |
| Últimos 4 dígitos del asegurado | CSV importado por UTLE | PIN de verificación en Paso 2 |
| Correo electrónico | CSV importado por UTLE | Envío del enlace personalizado |
| Teléfono | CSV importado por UTLE (opcional) | Referencia de contacto |
| Centro médico y tipo de atención | CSV importado por UTLE | Mostrado al paciente en Paso 3 |
| Respuestas del cuestionario | Ingresadas por el paciente | Registro del resultado de la depuración |

**La plataforma NO recopila:** contraseñas, datos bancarios, información de pagos, ubicación GPS, ni datos biométricos.

---

## 2. Mecanismos de seguridad implementados

### 2.1 Autenticación por token único
- Cada paciente recibe un enlace con un token UUID único (ejemplo: `?t=a3d46938-...`)
- El token es generado criptográficamente y es imposible de adivinar
- Vigencia máxima: **3 días** desde la generación
- Un token solo puede ser usado por el paciente al que fue asignado

### 2.2 Verificación de identidad en dos niveles
- **Nivel 1:** Token único en el enlace (algo que solo el paciente recibió)
- **Nivel 2:** Últimos 4 dígitos del número de asegurado (algo que solo el paciente sabe)
- **Máximo 3 intentos fallidos** — el acceso queda bloqueado automáticamente

### 2.3 Token de sesión por paso
- Al verificar su identidad, el servidor emite un token de sesión con vigencia de **2 horas**
- Cada avance de paso es validado por el servidor con dicho token
- Impide que un usuario manipule el flujo saltándose pasos

### 2.4 Expiración automática de enlaces
- Los enlaces vencen a los 3 días de ser generados
- Un enlace vencido muestra un mensaje de error y no permite continuar

### 2.5 Sin almacenamiento de sesión en el navegador
- No se utilizan cookies de sesión persistentes
- No se almacena información sensible en el navegador del paciente

---

## 3. Almacenamiento de datos

| Aspecto | Detalle |
|---------|---------|
| Proveedor | Supabase (PostgreSQL) |
| Ubicación del servidor | [PENDIENTE — confirmar región de Supabase] |
| Acceso a los datos | Solo personal autorizado de Coco Technology |
| Acceso UTLE | A través de reportes y exportaciones coordinadas con Coco Technology |
| Retención de datos | [PENDIENTE — definir política con UTLE] |

---

## 4. Aviso de privacidad al paciente

En el **Paso 1** del flujo, antes de que el paciente proporcione cualquier información, se le presenta:

- Explicación del propósito del proceso
- Indicación de que su participación es **voluntaria**
- Advertencia de que la CCSS **nunca solicitará** contraseñas, códigos de verificación, información bancaria ni pagos
- Correo de contacto para dudas: `gm_utle_gelisespera@ccss.sa.cr`
- Botón explícito de **"No autorizo"** que termina el proceso sin penalización

---

## 5. Qué pasa con los datos si el paciente no autoriza

Si el paciente selecciona "No autorizo" en el Paso 1:
- No se registra ninguna respuesta adicional
- El estado queda como `NO_AUTORIZO`
- No se vuelve a contactar al paciente en esa campaña

---

## 6. Transmisión de datos

| Canal | Protocolo | Detalle |
|-------|-----------|---------|
| Navegador ↔ Servidor | HTTPS (TLS 1.2+) | Conexión cifrada en todo momento |
| Servidor ↔ Base de datos | Conexión cifrada interna de Supabase | |
| Servidor ↔ Plataforma de correo | HTTPS API | Mailchimp API v3 |

---

*Documento elaborado por Coco Technology en coordinación con la UTLE — CCSS*
