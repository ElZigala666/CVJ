#!/bin/bash
# Prueba la acción "emparejar" de la función igdb con títulos difíciles (apóstrofos, signos, packs).
# Uso: bash herramientas/probar-emparejar.sh  (desde la raíz del repo; usa la clave pública de js/config.js)
cd "$(dirname "$0")/.."
KEY=$(grep -oE "SUPABASE_KEY = ['\"][^'\"]*" js/config.js | sed -E "s/.*['\"]//")
F=$(node -e "import(require('url').pathToFileURL(process.cwd() + '/js/config.js').href).then(m=>console.log(m.URL_FUNCION_IGDB))")
while IFS='|' read -r nombre plat; do
  cuerpo=$(python -c "import json,sys;print(json.dumps({'accion':'emparejar','nombre':sys.argv[1],'plataforma':sys.argv[2],'valorados':[]}))" "$nombre" "$plat")
  r=$(curl -s -X POST "$F" -H "apikey: $KEY" -H "Content-Type: application/json" --data-binary "$cuerpo")
  id=$(echo "$r" | python -c "import json,sys;d=json.load(sys.stdin);print(d.get('igdb_id') or ('propuesta '+str(d.get('propuesta_id'))), d.get('confianza'), d.get('motivo'))")
  nid=$(echo "$id" | awk '{print ($1=="propuesta")?$2:$1}')
  nombreIgdb=$(curl -s -X POST "$F" -H "apikey: $KEY" -H "Content-Type: application/json" -d "{\"accion\":\"juego\",\"igdb_id\":$nid}" 2>/dev/null | python -c "import json,sys;print(json.load(sys.stdin).get('juego',{}).get('nombre'))" 2>/dev/null)
  printf '%-34s → %s  [%s]\n' "$nombre" "$id" "$nombreIgdb"
done <<'LISTA'
That's You!™|PS4
Marvel's Spider-Man|PS4
Marvel’s Spider-Man|PS4
Assassin's Creed|PS4
Uncharted: Drake's Fortune|PS4
Don't Starve|PS4
Don’t Starve: Console Edition|PS4
Yu-Gi-Oh!|PS4
Yu-Gi-Oh! Legacy of the Duelist|PS4
Yu-Gi-Oh! Master Duel|PS5
Assassin's Creed|PC
Assassin’s Creed® Unity|PS4
That's You!™|
Don't Starve|
LISTA
