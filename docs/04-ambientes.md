# Ambientes y despliegue

## Resumen de ambientes

| | Preprod | Producción |
|---|---|---|
| **URL** | ccss-utle-preprod.netlify.app | ccss-utle-prod.netlify.app |
| **Rama GitHub** | `develop` | `main` |
| **Site ID Netlify** | `5788c4cc-9e11-4bf2-be8e-b1488e1eda36` | `ca1764d8-b395-4335-bd89-fd252d5473e5` |
| **Uso** | Pruebas, iteraciones, validación | Campañas reales con pacientes |
| **Base de datos** | Supabase (compartida) | Supabase (compartida) |
| **Deploy** | Manual o auto (si conectado a GitHub) | Solo manual o merge a `main` |

> ⚠️ Ambos ambientes comparten la misma base de datos Supabase por ahora.
> Para aislarlos completamente en producción se recomienda crear un proyecto Supabase separado.

---

## Flujo de cambios

```
Desarrollo local (localhost:3000)
          ↓  git push origin develop
Preprod (ccss-utle-preprod.netlify.app)
          ↓  validar + aprobar
          ↓  git merge develop → main
Producción (ccss-utle-prod.netlify.app)
```

---

## Comandos de deploy

### Desplegar a preprod
```bash
./node_modules/.bin/netlify deploy --build --prod --site 5788c4cc-9e11-4bf2-be8e-b1488e1eda36
```

### Desplegar a producción
```bash
git checkout main
git merge develop
git push origin main
git checkout develop
./node_modules/.bin/netlify deploy --build --prod --site ca1764d8-b395-4335-bd89-fd252d5473e5
```

---

## Configuración Netlify

### Variables de entorno (ambos sitios)

Configuradas en Netlify dashboard → Site configuration → Environment variables.

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://yknqcfyptjvpfahfdwch.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (secreto) |

### Plugin de Next.js

El archivo `netlify.toml` incluye `@netlify/plugin-nextjs` que habilita:
- Server Components
- API Routes como Netlify Functions
- Optimización de imágenes
- Caché de assets estáticos

---

## Supabase

**Proyecto:** `yknqcfyptjvpfahfdwch`
**Región:** East US (North Virginia) — `us-east-1`
**Dashboard:** https://supabase.com/dashboard/project/yknqcfyptjvpfahfdwch

### Acceso a la BD

Solo vía API Routes de Next.js usando `SUPABASE_SERVICE_ROLE_KEY`. El cliente `service_role` bypassa RLS y tiene acceso completo.

No se usa conexión directa TCP a PostgreSQL (puerto 5432 puede estar bloqueado por red).

### Migraciones

Las migraciones están documentadas en `supabase/migrations/`:
- `001_initial.sql` — Schema completo inicial
- `002_campana.sql` — Columna `campana_id`

Para ejecutar una nueva migración usar la API de gestión de Supabase (ver scripts internos de CoCo).

---

## GitHub

**Repositorio:** https://github.com/landrex90/ccss_utle
**Visibilidad:** Privado
**Ramas:**
- `main` — producción estable
- `develop` — trabajo en curso

### Convención de commits

```
feat: nueva funcionalidad
fix: corrección de bug
style: cambios de UI/CSS sin lógica
docs: documentación
chore: configuración, dependencias
```

---

## Checklist de deploy a producción

Antes de hacer merge de `develop` a `main` y desplegar:

- [ ] Probado en preprod con datos reales de prueba
- [ ] Todos los flujos del formulario funcionan (completar, renunciar, no autorizar, etc.)
- [ ] El bloqueo de link tras responder funciona
- [ ] Los scripts de import y export funcionan correctamente
- [ ] No hay errores en la consola del navegador
- [ ] Dark mode y alto contraste se ven correctamente
- [ ] Se aprueba por Andres Zapata (CoCo) antes de desplegar
