# CVJ · Críticas de VideoJuegos

App web (PWA) para un grupo pequeño de amigos: valorar juegos, llevar horas jugadas de
PlayStation, Xbox y Steam, tier lists, rankings del grupo y columnas de opinión. Todo en
español (código, comentarios, commits, interfaz).

## Stack
- **Web**: HTML + CSS + JavaScript vanilla (módulos ES, sin build ni npm). GitHub Pages.
  Service worker (`sw.js`) con caché versionada por commit.
- **Datos**: Supabase (Postgres + PostgREST + Storage). Sin Supabase Auth: login con
  código personal (se guarda su SHA-256 en `usuarios.codigo_hash`) y la sesión vive en
  localStorage. RLS abierto a `anon` en casi todo (es un grupo de confianza).
- **Edge Functions** (Deno, `supabase/functions/*`, siempre `verify_jwt = false`):
  - `igdb`: proxy de IGDB (buscar, fichas, sagas, tiempo para terminar, emparejar PSN).
  - `psn`: PlayStation no oficial (cada uno pega su NPSSO); trofeos y horas.
  - `xbox`: OpenXBL por gamertag con la clave del grupo (cupo en `openxbl_uso`).
  - `steam`: inicio de sesión oficial (OpenID 2.0) + GetOwnedGames.
  - `admin`: gestionar el grupo (crear persona, código nuevo, editar, activar). Comprueba
    `es_admin` de quien llama.

## Mapa de archivos
- `index.html`: shell; aplica tema/acento/fondo antes de pintar. `manifest.webmanifest`.
- `css/tokens.css` (variables), `css/app.css` (todo, móvil), `css/escritorio.css` (solo
  dentro de media queries anchas; no puede alterar el móvil).
- `js/app.js`: arranque, rutas por hash (`#inicio`, `#juego/123`...), barra inferior,
  carga perezosa de pantallas.
- `js/datos.js`: datos del grupo en memoria + caché IndexedDB, refresco por "huellas",
  escrituras optimistas con reversión. `js/metricas.js`: perfiles, tier list, rankings,
  comparar, horas (`sumarHoras`, `desgloseDe`, estimaciones), memoizado por versión.
- `js/notas.js` escala S-F. `js/sesion.js` + `js/codigo.js` login. `js/supabase.js`
  cliente (solo para escribir). `js/config.js` URL y clave pública.
- `js/ui.js` piezas HTML; `js/icons.js` iconos propios rellenos; `js/hoja.js` hoja
  inferior genérica; `js/portadas.js`, `js/color-dominante.js`.
- `js/hoja-valorar.js` valorar (estado, nota, plataformas, reseña, cuenta en ranking).
- `js/horas-ui.js` desglose de horas con control manual; `js/estimaciones.js` automático.
- `js/fusiones.js` "¿Es el mismo juego?"; `js/colecciones-ui.js`; `js/menu-juego.js`.
- `js/seleccion.js` selección múltiple; `js/deslizar.js` cambiar de pestaña deslizando;
  `js/galeria.js`; `js/refrescar.js` tirar para refrescar; `js/celebracion.js`.
- `js/psn.js`, `js/xbox.js`, `js/steam.js`, `js/igdb.js` + `js/ajustes-*.js`,
  `js/cuentas-ui.js`, `js/plataformas-ui.js`: plataformas y Ajustes.
- `js/apariencia.js`, `js/tema.js`, `js/acento.js`, `js/selector-color.js`,
  `js/ajustes-fondo.js`, `js/perfil-editar.js`, `js/perfil-personal.js`, `js/foto-perfil.js`.
- `js/columnas-ui.js`: piezas de columnas (formato del cuerpo, tarjetas).
- `js/insignias.js`: catálogo de insignias (condiciones), medallas SVG, cálculo memorizado
  por versión de datos, guardado de cambios tras cada refresco, avisos y vitrina del perfil.
- `js/social.js`: reacciones y respuestas (tira bajo reseñas y entradas, menú, hilo,
  aviso "Lo nuevo en lo tuyo" y filas de actividad).
- `js/pantallas/`: `inicio`, `buscar`, `juego`, `perfil` (+ tier list), `rankings`
  (+ comparar), `estadisticas`, `coleccion`, `saga`, `revisar`, `duplicados`, `entrada`
  (login), `escribir` (editor de columna), `lectura` (#entrada/{id}), `columna`.
- `prueba-local.html` (solo en este equipo: excluido en `.git/info/exclude`): la app con
  un Supabase simulado en memoria, para probar en local
  (`.claude/launch.json` → `cvj-local`: `herramientas/servidor-local.py`, sin caché,
  puerto 8766; sin service worker; `localStorage['prueba.escenario'] = 'fase3'` trae
  columnas, entradas, reacciones e insignias; `window.__fallar = true` simula sin red).
- `herramientas/`: restaurar copia (`RESTAURAR.md`, `restaurar-copia.sh`), pruebas de
  PSN/Xbox/buscador, generar iconos y hash de código.
- `cvj-diseno/`: diseño original de referencia (no se publica).
- `supabase/migrations/`: esquema numerado `2026110700NNNN_nombre.sql`; la siguiente
  usa el número siguiente. Escribirlas idempotentes (`if not exists`, `create or replace`).

## Modelo de datos (public)
- `usuarios`: nombre, inicial, color, acento, `codigo_hash`, `es_admin`, `activo`
  (desactivado = no sale en listas, sus datos cuentan), `apariencia`/`perfil_datos`
  (jsonb), `umbral_probados`, `estimar_horas`, `plataformas_ocultas`.
- `juegos` (PK `igdb_id`): caché de IGDB + `es_online`(_manual) = sin final,
  `relaciones` (jsonb de IGDB), `ttb_*` tiempo para terminar, `mostrar_como` (versión
  cuya portada/nombre se enseña).
- `juegos_alias` (alias → principal, `auto`): versiones fusionadas. `versiones_separadas`:
  lo que el admin separó (no se vuelve a fusionar solo). `fusiones_rechazadas`: "son
  distintos" por usuario.
- `valoraciones` (usuario, juego): `estado` jugando/completado/abandonado/pendiente,
  `nota` 0-10, `recomendado`, `resena`, `plataformas[]`, `cuenta_ranking`, `vueltas`,
  `rejugando`, `jugando_desde`. Se quedan en la versión jugada; cuentan en el principal.
- `colecciones` + `colecciones_juegos` + `valoraciones_coleccion`: juegos que cuentan
  como UNO (FIFA/EA FC): nota, horas y tarjeta únicas. Solo el admin las crea.
- `sagas` + `sagas_juegos` (`manual`, `excluido`) + `sagas_usuario`: juegos independientes
  que se ven juntos (Persona, Zelda), generadas desde IGDB; no se valoran.
- `cuentas_plataforma` (fuente psn/xbox/steam, varias por usuario) → `biblioteca`
  (filas por título y cuenta: horas, ultima_vez, trofeos, `juego_id`, `detectado`,
  `oculto`, `por_revisar`). `psn_cuentas` tokens PSN. `psn_igdb` emparejamiento de
  títulos de plataforma con IGDB (o colección / no_juego).
- `horas_extra` (a mano, por usuario y juego), `horas_estimadas` (IGDB: historia/extras/
  completo, `auto`, `descartada`), `horas_ajustes` (líneas excluidas, plataforma corregida,
  `distintas`).
- `columnas` (una por columnista, creada por el admin) → `entradas` (borrador/publicada,
  `cuerpo` texto ≤ 100 000, sobre juego/colección/saga) → `lecturas` (de todos; solo se
  apuntan al leer de verdad: final del texto + unos segundos, o un rato a la vista).
- `reacciones` (una por usuario y objetivo: buena/mala/acuerdo/discrepo/wtf) y
  `comentarios` (respuestas ≤ 500): `objetivo` = valoracion | valoracion_coleccion |
  entrada + `objetivo_id`. Se borran solos con su reseña o entrada (trigger).
  `usuarios.social_visto_en`: hasta cuándo vio cada uno lo nuevo de lo suyo.
  Todo lo social va en `js/social.js` y se repinta en su sitio (`datos.suscribirSocial`).
- `insignias` (personales: usuario, insignia, nivel 1-3, nunca bajan) e `insignias_grupo`
  (una fila por insignia: dueño actual, anterior, desde). `inicial` = calculada al
  estrenar (no sale en la actividad). `usuarios.insignias_visto_en` para los avisos; la
  vitrina elegida va en `perfil_datos.insignias`. Las condiciones viven en el cliente.
- `actividad` (feed: valoro/empezo/completo/abandono/pendiente/rejuega, `lote`,
  `celebrar`), `celebraciones_vistas`, `avisos`, `estado_servicios`, `igdb_token`,
  `openxbl_uso`.

## Reglas de negocio
- **Notas**: se guardan 0-10 con un decimal; la letra se deriva (`js/notas.js`):
  S ≥ 9 · A ≥ 8 · B ≥ 7 · C ≥ 6 · D ≥ 5 · E ≥ 3.5 · F. Elegir letra = su equivalente (S 9.5...).
- **Contar en tier list** (`cuenta_ranking`): lo decide cada uno al valorar; si falta,
  los juegos sin final no cuentan y los demás sí. Afecta tier list, estadísticas de nota y
  rankings de nota.
- **Juegos sin final** (`es_online`): online/competitivos; van en su sección del perfil y
  "Jugando ahora", no se "completan". El admin los marca a mano.
- **Horas** = sincronizadas (por fuente, cuenta y plataforma) + extra a mano + estimadas.
  - La sincronización NUNCA sobrescribe horas con null (si la fuente no da dato, se queda
    lo que había). Steam siempre da número (0 si no jugado).
  - Por defecto TODO suma. Dentro de una misma cuenta, filas con mismas horas y misma
    última vez son el mismo dato y cuentan una vez. Con Steam, el "PC detectado" de Xbox
    no suma.
  - Posible duplicado Steam/Xbox: solo aviso (no cambia el total); el usuario decide en
    `horas_ajustes` (excluir línea o "son partidas distintas").
  - Estimadas: la automática se retira sola si hay horas reales o extra; la elegida a mano
    no la toca el automático; borrar = `descartada`.
- **Colecciones vs sagas**: colección = un solo juego a efectos de nota y horas; saga =
  agrupación visual de juegos que se valoran por separado.
- **Fusiones**: automáticas (`fusionar_versiones()`): ediciones, ports, remasters y
  ampliados se funden en el original; remakes no; tampoco si el original es prólogo/demo/
  episodio. Ante la duda, tarjeta "¿Es el mismo juego?" (fusión manual o rechazo por
  usuario). El admin puede separar versiones y elegir la portada/nombre a enseñar.
- **Admin** (`es_admin`): gestionar grupo (vía función `admin`), columnas, colecciones,
  sagas, sin final, separar versiones. La interfaz oculta esas acciones al resto.

## Despliegue
- Push a `main` → `.github/workflows/pages.yml` publica la web (sustituye `__VERSION__`
  por el hash y genera la lista del app shell en `sw.js`).
- Si toca `supabase/**` → `supabase.yml` aplica migraciones (`db push`) y despliega TODAS
  las funciones sin JWT. Secretos en GitHub: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
  `SUPABASE_PROJECT_REF`. En local están en `.env.local` (nunca al repo).
- `copia-seguridad.yml`: cada lunes, volcado de la base + Storage, cifrado con GPG (clave
  = contraseña de la base), probado restaurándolo; se guardan 8. El repo es público: no
  imprimir datos en los registros.
- Consultas a la base real desde aquí: API de gestión
  `POST https://api.supabase.com/v1/projects/pthjktvmiaijhzvsbrnv/database/query` con el
  token de `.env.local` (no mostrarlo nunca).

## Cómo trabajar aquí
- Despliegas y migras tú (commit + push a main). En "LO QUE TIENES QUE HACER TÚ" solo lo
  imprescindible que no se pueda hacer desde aquí.
- Sin emojis en la interfaz; iconos propios rellenos (`js/icons.js`).
- Cambios pequeños de aspecto: sin pruebas. Lo importante se prueba con datos reales.
- Móvil primero (390 px de ancho). La versión de escritorio va en `css/escritorio.css`
  y no puede cambiar nada del móvil.
- Commits en español, descriptivos (qué cambia para el usuario). Migración en un commit
  propio antes del código que la usa.
