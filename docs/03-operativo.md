# Guía operativa — Uso diario

## Requisitos previos

- Tener la carpeta del proyecto abierta en la Terminal
- Archivo `.env.local` configurado con las credenciales de Supabase
- Node.js 20 o superior instalado

Para navegar a la carpeta del proyecto en la Terminal:
```bash
cd /Users/andreszapatacano/CCSS
```

---

## Ciclo de una campaña de correo

### Paso 1 — Preparar el archivo de pacientes

Reciba el Excel de UTLE y expórtelo como **CSV UTF-8**.

El archivo debe tener estas columnas (puede usar `scripts/pacientes_template.csv` como guía):

| Columna | Requerida | Ejemplo |
|---|---|---|
| `id_registro` | No (se auto-genera) | REG-2026-00001 |
| `nombre_paciente` | **Sí** | María López Hernández |
| `numero_asegurado` | **Sí** | 1-2345-6789 |
| `correo` | **Sí** | maria@gmail.com |
| `telefono` | No | 88881111 |
| `centro_medico` | **Sí** | Hospital San Juan de Dios |
| `tipo_atencion` | **Sí** | `consulta` / `cirugia` / `procedimiento` |
| `especialidad` | No | Ortopedia |
| `nombre_servicio` | No | Artroscopia de rodilla |
| `lateralidad` | No | Derecha |
| `ultimos_4_asegurado` | **Sí** | 6789 |

> ⚠️ `ultimos_4_asegurado` debe ser exactamente 4 dígitos numéricos.
> ⚠️ `tipo_atencion` debe ser exactamente: `consulta`, `cirugia` o `procedimiento`.

---

### Paso 2 — Importar pacientes y generar URLs

```bash
npm run import pacientes.csv https://ccss-utle-prod.netlify.app --campana 2026-05-01_HospMexico
```

**Parámetros:**
- `pacientes.csv` — ruta al archivo de pacientes
- `https://ccss-utle-prod.netlify.app` — URL base (usar prod para campañas reales)
- `--campana 2026-05-01_HospMexico` — identificador de la campaña

**El script genera automáticamente:** `pacientes_urls.csv`

Este archivo tiene todas las columnas originales más la columna `url` con el enlace personalizado de cada paciente.

---

### Paso 3 — Cargar las URLs en la herramienta de email

Abra `pacientes_urls.csv` y use la columna `url` en su herramienta de email marketing para personalizar cada correo con el enlace del paciente.

El correo debe incluir algo como:
> "Para actualizar su información, por favor haga clic en el siguiente enlace personalizado: [su enlace]"

---

### Paso 4 — Exportar resultados

Al finalizar la campaña (o en cualquier momento para seguimiento):

**Todos los resultados:**
```bash
npm run export
```

**Solo una campaña específica:**
```bash
npm run export --campana 2026-05-01_HospMexico
```

Se genera un archivo `resultados_2026-05-01_HospMexico_YYYY-MM-DD.csv`.

---

### Paso 5 — Importar resultados a Google Sheets

1. Abra [sheets.google.com](https://sheets.google.com)
2. Cree una hoja nueva
3. **Archivo → Importar → Subir** el archivo CSV
4. Separador: **Coma**, codificación: **UTF-8**
5. Clic en **Importar datos**

---

## Comandos de referencia rápida

```bash
# Importar pacientes con campaña
npm run import <archivo.csv> <url-base> --campana <id-campana>

# Exportar todos los resultados
npm run export

# Exportar por campaña
npm run export --campana <id-campana>

# Iniciar servidor de desarrollo (local)
npm run dev

# Desplegar a preprod
./node_modules/.bin/netlify deploy --build --prod --site ccss-utle-preprod

# Desplegar a producción (solo cuando esté validado en preprod)
./node_modules/.bin/netlify deploy --build --prod --site ca1764d8-b395-4335-bd89-fd252d5473e5
```

---

## Identificadores de campaña — Convención de nombres

```
YYYY-MM-DD_Hospital_Especialidad

Ejemplos:
  2026-05-01_HospMexico_Cardiologia
  2026-05-02_HSJD_Cirugia
  2026-05-03_HCalderon_Gastro
  2026-05-04_General_Todos
```

**Abreviaturas sugeridas para hospitales:**
| Hospital | Abreviatura |
|---|---|
| Hospital México | HospMexico |
| Hospital San Juan de Dios | HSJD |
| Hospital Calderón Guardia | HCalderon |
| Hospital Nacional de Niños | HNN |
| Hospital Monseñor Sanabria | HMS |

---

## Formato del archivo de resultados

El CSV de exportación contiene estas columnas:

| Columna | Descripción |
|---|---|
| `id_registro` | ID del paciente |
| `nombre_paciente` | Nombre completo |
| `correo` | Correo electrónico |
| `telefono` | Teléfono |
| `tipo_atencion` | Tipo de atención |
| `especialidad` | Especialidad |
| `centro_medico` | Hospital |
| `campana_id` | ID de la campaña |
| `estado_registro` | Estado final del registro |
| `fecha_respuesta` | Fecha y hora de la respuesta |
| `canal` | `correo` |
| `completado` | Sí / No |
| `estado_final` | Resultado de la encuesta |
| `paso_abandono` | Paso donde abandonó (si aplica) |
| `consentimiento` | `si_autorizo` / `no_autorizo` |
| `verificacion` | `exitosa` / `fallida` |
| `intentos_verificacion` | Número de intentos usados |
| `info_correcta` | `si` / `no` |
| `desea_continuar` | Decisión del paciente |
| `motivo_retiro` | Por qué quiere retirarse |
| `flexibilidad_centro` | ¿Acepta otro centro? |
| `condiciones_asistir` | ¿Puede asistir? |
| `motivo_no_asistir` | Por qué no puede asistir |
| `medio_contacto` | Preferencia de contacto futuro |

---

## Flujo de trabajo Git

```
Trabajo diario → rama develop → preprod (validar) → merge a main → producción
```

**Para subir cambios a preprod:**
```bash
git add .
git commit -m "descripción del cambio"
git push origin develop
```

**Para pasar a producción (solo cambios validados):**
```bash
git checkout main
git merge develop
git push origin main
git checkout develop
```

---

## Solución de problemas comunes

### El enlace no carga / muestra "enlace no válido"
- Verificar que el token en la URL sea correcto
- El registro puede haber expirado (más de 30 días)
- El registro puede haber sido respondido ya

### El paciente no puede verificar su identidad
- Verificar que `ultimos_4_asegurado` en el CSV sea correcto
- El paciente tiene máximo 3 intentos; después queda bloqueado
- Para desbloquear: correr el script de reset en la BD

### Error al importar CSV
- Verificar que el archivo esté en formato CSV UTF-8
- Verificar que todas las columnas requeridas estén presentes
- Verificar que `tipo_atencion` sea exactamente `consulta`, `cirugia` o `procedimiento`
- Verificar que `ultimos_4_asegurado` tenga exactamente 4 dígitos

### Error de conexión al correr scripts
- Verificar que `.env.local` tenga las credenciales correctas
- Verificar conexión a internet (los scripts se conectan a Supabase en la nube)
