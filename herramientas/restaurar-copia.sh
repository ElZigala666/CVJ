#!/usr/bin/env bash
# Restaura una copia de seguridad de CVJ (ver herramientas/RESTAURAR.md).
#
#   bash herramientas/restaurar-copia.sh ver            copia.dump.gpg
#   bash herramientas/restaurar-copia.sh restaurar      copia.dump.gpg "host=... port=5432 user=... dbname=postgres sslmode=require" [esquemas]
#   bash herramientas/restaurar-copia.sh subir-archivos copia-archivos.tar.gpg [ref del proyecto]
#
# "ver" no toca ninguna base: descifra y dice qué hay dentro.
# "restaurar" SUSTITUYE las tablas de esos esquemas (por defecto, public) por las de la copia.
# Va todo en una transacción: si algo falla, la base se queda como estaba.
# "subir-archivos" vuelve a subir a Storage los archivos de la copia (crea los cubos que
# falten y sustituye los que ya existan con el mismo nombre). Necesita
# SUPABASE_ACCESS_TOKEN (o .env.local) para pedir la clave de servicio del proyecto.
#
# Clave de la copia: COPIA_CLAVE o SUPABASE_DB_PASSWORD o, si no, la de .env.local.
# Contraseña de la base de destino: PGPASSWORD (si no está, se pregunta).
# Sirve con pg_restore instalado (versión 17) o, si no, con Docker.
set -euo pipefail

accion=${1:-}
archivo=${2:-}
destino=${3:-}
esquemas=${4:-public}

uso() { sed -n '4,6p' "$0" | sed 's/^# *//' >&2; exit 2; }
[ -n "$accion" ] && [ -f "$archivo" ] || uso
[ "$accion" = ver ] || [ "$accion" = subir-archivos ] || { [ "$accion" = restaurar ] && [ -n "$destino" ]; } || uso

raiz=$(cd "$(dirname "$0")/.." && pwd)
clave=${COPIA_CLAVE:-${SUPABASE_DB_PASSWORD:-}}
if [ -z "$clave" ] && [ -f "$raiz/.env.local" ]; then
  clave=$(sed -nE 's/^[[:space:]]*SUPABASE_DB_PASSWORD=//p' "$raiz/.env.local" | tr -d '\r')
fi
[ -n "$clave" ] || { echo "Falta la clave de la copia: pon COPIA_CLAVE o SUPABASE_DB_PASSWORD." >&2; exit 1; }

carpeta=$(mktemp -d)
trap 'rm -rf "$carpeta"' EXIT

# Archivos de Storage: descifrar, revisar y volver a subir.
if [ "$accion" = subir-archivos ]; then
  ref=${destino:-${SUPABASE_PROJECT_REF:-pthjktvmiaijhzvsbrnv}}
  token=${SUPABASE_ACCESS_TOKEN:-}
  if [ -z "$token" ] && [ -f "$raiz/.env.local" ]; then
    token=$(sed -nE 's/^[[:space:]]*SUPABASE_ACCESS_TOKEN=//p' "$raiz/.env.local" | tr -d '\r')
  fi
  [ -n "$token" ] || { echo "Falta SUPABASE_ACCESS_TOKEN." >&2; exit 1; }
  printf '%s' "$clave" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
    --decrypt --output "$carpeta/archivos.tar" "$archivo" \
    || { echo "No se ha podido descifrar. Si la contraseña de la base cambió después de esta copia, usa la de entonces en COPIA_CLAVE." >&2; exit 1; }
  tar -C "$carpeta" -xf "$carpeta/archivos.tar"
  echo "En la copia: $(wc -l < "$carpeta/lista.tsv") archivos en $(wc -l < "$carpeta/cubos.tsv") cubos ($(cut -f1 "$carpeta/cubos.tsv" | tr '\n' ' '))."
  read -r -p "Escribe SUBIR para subirlos al proyecto $ref: " respuesta
  [ "$respuesta" = SUBIR ] || { echo 'Cancelado: no se ha subido nada.'; exit 1; }
  servicio=$(curl -fsS -H "Authorization: Bearer $token" "https://api.supabase.com/v1/projects/$ref/api-keys?reveal=true" \
    | python -c 'import json, sys; print(next(x["api_key"] for x in json.load(sys.stdin) if x.get("name") == "service_role"))') \
    || { echo "No se ha podido leer la clave de servicio del proyecto $ref." >&2; exit 1; }
  base="https://$ref.supabase.co/storage/v1"
  cabeceras=(-H "Authorization: Bearer $servicio" -H "apikey: $servicio")
  while IFS=$'\t' read -r cubo publico; do
    publico=$([ "$publico" = t ] && echo true || echo false)
    curl -sS -o /dev/null "${cabeceras[@]}" -H 'Content-Type: application/json' \
      -d "{\"id\":\"$cubo\",\"name\":\"$cubo\",\"public\":$publico}" "$base/bucket" || true  # si ya existe, falla y sigue
  done < "$carpeta/cubos.tsv"
  bien=0; mal=0
  while IFS=$'\t' read -r cubo nombre tipo; do
    ruta=$(python -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$nombre")
    if curl -fsS -o /dev/null "${cabeceras[@]}" -H "Content-Type: $tipo" -H 'x-upsert: true' \
        --data-binary "@$carpeta/objetos/$cubo/$nombre" "$base/object/$cubo/$ruta"; then bien=$((bien + 1)); else mal=$((mal + 1)); echo "  No se ha podido subir $cubo/$nombre" >&2; fi
  done < "$carpeta/lista.tsv"
  echo "Subidos $bien archivos$([ "$mal" -gt 0 ] && echo ", fallidos $mal")."
  [ "$mal" -eq 0 ]
  exit
fi

# pg_restore de aquí o, si no hay, el de Docker.
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
