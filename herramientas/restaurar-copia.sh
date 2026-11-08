#!/usr/bin/env bash
# Restaura una copia de seguridad de CVJ (ver herramientas/RESTAURAR.md).
#
#   bash herramientas/restaurar-copia.sh ver       copia.dump.gpg
#   bash herramientas/restaurar-copia.sh restaurar copia.dump.gpg "host=... port=5432 user=... dbname=postgres sslmode=require" [esquemas]
#
# "ver" no toca ninguna base: descifra y dice qué hay dentro.
# "restaurar" SUSTITUYE las tablas de esos esquemas (por defecto, public) por las de la copia.
# Va todo en una transacción: si algo falla, la base se queda como estaba.
#
# Clave de la copia: COPIA_CLAVE o SUPABASE_DB_PASSWORD o, si no, la de .env.local.
# Contraseña de la base de destino: PGPASSWORD (si no está, se pregunta).
# Sirve con pg_restore instalado (versión 17) o, si no, con Docker.
set -euo pipefail

accion=${1:-}
archivo=${2:-}
destino=${3:-}
esquemas=${4:-public}

uso() { sed -n '4,5p' "$0" | sed 's/^# *//' >&2; exit 2; }
[ -n "$accion" ] && [ -f "$archivo" ] || uso
[ "$accion" = ver ] || { [ "$accion" = restaurar ] && [ -n "$destino" ]; } || uso

raiz=$(cd "$(dirname "$0")/.." && pwd)
clave=${COPIA_CLAVE:-${SUPABASE_DB_PASSWORD:-}}
if [ -z "$clave" ] && [ -f "$raiz/.env.local" ]; then
  clave=$(sed -nE 's/^[[:space:]]*SUPABASE_DB_PASSWORD=//p' "$raiz/.env.local" | tr -d '\r')
fi
[ -n "$clave" ] || { echo "Falta la clave de la copia: pon COPIA_CLAVE o SUPABASE_DB_PASSWORD." >&2; exit 1; }

# pg_restore de aquí o, si no hay, el de Docker.
carpeta=$(mktemp -d)
trap 'rm -rf "$carpeta"' EXIT
if command -v pg_restore > /dev/null 2>&1; then
  pg() { pg_restore "$@"; }
  volcado="$carpeta/copia.dump"
elif command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1; then
  ruta=$carpeta
  command -v cygpath > /dev/null 2>&1 && ruta=$(cygpath -m "$carpeta")
  pg() { MSYS_NO_PATHCONV=1 docker run --rm -e PGPASSWORD -v "$ruta:/copia" --network host postgres:17 pg_restore "$@"; }
  volcado=/copia/copia.dump
else
  echo "Hace falta pg_restore (PostgreSQL 17) o Docker en marcha." >&2
  exit 1
fi

printf '%s' "$clave" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --decrypt --output "$carpeta/copia.dump" "$archivo" \
  || { echo "No se ha podido descifrar. Si la contraseña de la base cambió después de esta copia, usa la de entonces en COPIA_CLAVE." >&2; exit 1; }
[ "$(head -c 5 "$carpeta/copia.dump")" = PGDMP ] || { echo "El archivo descifrado no es un volcado de PostgreSQL." >&2; exit 1; }

if [ "$accion" = ver ]; then
  pg --list "$volcado" > "$carpeta/lista.txt"
  sed -n '/^; Archive created at/p; /^; Dumped from database version/p' "$carpeta/lista.txt"
  echo "Tablas por esquema (con datos en la copia):"
  grep ' TABLE DATA ' "$carpeta/lista.txt" | awk '{ for (i = 1; i <= NF; i++) if ($i == "DATA") print $(i + 1) }' | sort | uniq -c
  exit 0
fi

argumentos=()
IFS=',' read -ra lista <<< "$esquemas"
for e in "${lista[@]}"; do argumentos+=(--schema="$e"); done

# Sin preguntar solo en una base local (la prueba del workflow).
if [ "${COPIA_SIN_PREGUNTAR:-}" != 1 ] || ! grep -q 'host=127\.0\.0\.1' <<< "$destino"; then
  echo "Se van a SUSTITUIR las tablas de [$esquemas] en: $(sed -E 's/password=[^ ]*/password=***/' <<< "$destino")"
  read -r -p 'Escribe RESTAURAR para seguir: ' respuesta
  [ "$respuesta" = RESTAURAR ] || { echo 'Cancelado: no se ha tocado nada.'; exit 1; }
fi
if [ -z "${PGPASSWORD:-}" ]; then
  read -r -s -p 'Contraseña de la base de destino: ' PGPASSWORD; echo
fi
export PGPASSWORD

# --no-owner: en Supabase los dueños ya son los suyos. Los permisos sí se restauran.
pg --dbname="$destino" --clean --if-exists --no-owner --single-transaction --exit-on-error "${argumentos[@]}" "$volcado"
echo "Restaurado: [$esquemas]."
