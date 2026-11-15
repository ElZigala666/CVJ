# Copias de seguridad de CVJ

Las hace el workflow **Copia de seguridad** (`.github/workflows/copia-seguridad.yml`): cada
lunes de madrugada y cuando se lance a mano (Actions → Copia de seguridad → Run workflow).
Se guardan las **últimas 8** como artefactos, 90 días como mucho.

Cada copia trae dos archivos:
- `copia-cvj-FECHA.dump.gpg`: un `pg_dump` completo (esquema y datos de todos los esquemas).
  El workflow lo prueba restaurándolo en una base vacía y comparando las filas de cada tabla
  de `public`.
- `copia-cvj-FECHA-archivos.tar.gpg`: los archivos de Storage (fotos de perfil e imágenes de
  las columnas), con la lista de cubos y el tipo de cada archivo.

Si algo falla, GitHub avisa por correo y no se borra ninguna copia anterior.

**Van cifradas** con AES-256 porque el repositorio es público y cualquiera con cuenta de
GitHub puede descargar sus artefactos. La clave es la contraseña de la base,
`SUPABASE_DB_PASSWORD` (está en `.env.local`). Si la contraseña cambia, actualiza el secreto
de GitHub y `.env.local`, y **apunta la antigua**: las copias anteriores se siguen
descifrando con la de entonces.

**Lo que NO entra:** los valores de los secretos (abajo está la lista de nombres) y las
propias funciones, que están en `supabase/functions`.

## 1. Descargar una copia

```bash
gh run list --workflow copia-seguridad.yml --repo ElZigala666/CVJ --limit 10
```

```bash
gh run download ID_DE_LA_EJECUCION --repo ElZigala666/CVJ --pattern 'copia-cvj-*'
```

También se puede descargar desde la página de la ejecución, en Actions (viene en un zip).

## 2. Ver qué hay dentro (no toca nada)

```bash
bash herramientas/restaurar-copia.sh ver copia-cvj-FECHA.dump.gpg
```

Hace falta `gpg` (viene con Git Bash) y `pg_restore` de PostgreSQL 17 o Docker Desktop en
marcha. Coge la clave de `.env.local`.

## 3. Restaurar en el proyecto de siempre

Es el caso normal: alguien ha borrado o estropeado datos. **Sustituye todas las tablas de
`public` por las de la copia**, así que lo escrito después de esa copia se pierde.

La conexión es la del pooler en modo sesión (Supabase → Connect → Session pooler), porque la
directa es solo IPv6:

```bash
bash herramientas/restaurar-copia.sh restaurar copia-cvj-FECHA.dump.gpg "host=aws-1-eu-central-1.pooler.supabase.com port=5432 user=postgres.pthjktvmiaijhzvsbrnv dbname=postgres sslmode=require"
```

Pide escribir `RESTAURAR` y la contraseña de la base. Va en una sola transacción: si falla
algo, la base se queda como estaba. El guion lo prueba el workflow cada semana, pero en una
base PostgreSQL vacía, no en Supabase.

Si faltan fotos o imágenes, vuelve a subirlas (sustituye las que tengan el mismo nombre; las
demás no se tocan):

```bash
bash herramientas/restaurar-copia.sh subir-archivos copia-cvj-FECHA-archivos.tar.gpg
```

Para sacar solo una tabla sin tocar el resto, descifra la copia a mano y usa `pg_restore`:

```bash
gpg --decrypt --output copia.dump copia-cvj-FECHA.dump.gpg
```

```bash
pg_restore --data-only --table=valoraciones --file=valoraciones.sql copia.dump
```

Borra `copia.dump` y ese `.sql` al terminar: tienen tokens y datos sin cifrar, y nunca deben
ir al repositorio.

## 4. Si se ha perdido el proyecto entero

Este camino no se ha ensayado nunca; hazlo con calma y compruébalo en cada paso.

1. Crea un proyecto nuevo en Supabase, con la misma versión de PostgreSQL.
2. Activa las extensiones `pg_cron` y `pg_net` (Database → Extensions).
3. Restaura `public` y el historial de migraciones con el guion de arriba, poniendo la
   conexión del proyecto nuevo y, como último argumento, `public,supabase_migrations`.
4. Sube los archivos con `subir-archivos`, poniendo como último argumento la ref del
   proyecto nuevo (crea los cubos `avatares` y `columnas`, públicos).
5. Vuelve a crear las tareas programadas: copia los bloques `cron.schedule` de
   `supabase/migrations/*.sql` en el editor SQL, cambiando la URL del proyecto.
6. Pon el nuevo `SUPABASE_PROJECT_REF` y la nueva `SUPABASE_DB_PASSWORD` en los secretos de
   GitHub y en `.env.local`, y lanza **Desplegar Supabase** para subir las funciones.
7. Vuelve a poner los secretos de las funciones (lista abajo).
8. Cambia la URL y la clave en `js/config.js` y súbelo.

## Secretos (solo los nombres)

Los valores no están en ninguna copia: hay que sacarlos otra vez de cada servicio.

**Edge Functions** (Supabase → Edge Functions → Secrets). Los que hay que crear a mano:

| Nombre | De dónde sale |
|---|---|
| `TWITCH_CLIENT_ID` | Consola de desarrolladores de Twitch (para IGDB) |
| `TWITCH_CLIENT_SECRET` | La misma aplicación de Twitch |
| `OPENXBL_API_KEY` | Cuenta de OpenXBL (Xbox) |
| `STEAM_API_KEY` | Clave web de Steam |

Supabase pone solos los demás que ven las funciones (no hay que crearlos):
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
`SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`.

**GitHub** (Settings → Secrets and variables → Actions), para desplegar y para las copias:

| Nombre | Qué es |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token personal de supabase.com (Account → Access Tokens) |
| `SUPABASE_PROJECT_REF` | La ref del proyecto (la parte de la URL antes de `.supabase.co`) |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base; también es la clave de las copias |

Los tres están también en `.env.local` (en el PC, nunca en el repositorio) salvo la ref.
