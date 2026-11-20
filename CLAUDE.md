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
  - `igdb`: proxy de IGDB (buscar, fichas, sagas, tiempo para terminar, emparejar PSN) y
    clasificación (acción `clasificar`, cron `cvj-clasificar` cada hora: los de `temas` null).
  - `psn`: PlayStation no oficial (cada uno pega su NPSSO); trofeos y horas.
  - `xbox`: OpenXBL por gamertag con la clave del grupo (cupo en `openxbl_uso`).
  - `steam`: inicio de sesión oficial (OpenID 2.0) + GetOwnedGames.
  - `admin`: gestionar el grupo (crear persona, código nuevo, editar) y el cementerio
    (expulsar, exorcizar, levantar, readmitir, vetar, permitir → `admin_vida()`), las
    apelaciones (`apelaciones` lista con texto, `apelacion_aceptar`, `apelacion_rechazar` →
    `admin_apelacion()`) y las propuestas (aparcar, reabrir, rechazar → `admin_propuesta()`; `crear` con `propuesta_id`
    la acepta y enlaza a la persona) y `whatsapp` (ver/guardar el número del Dictador). Comprueba
    `es_admin` de quien llama. La app la llama con `js/admin-api.js`.

## Mapa de archivos
- `index.html`: shell; aplica lo resuelto de apariencia (`localStorage` "cvj.ap") antes de pintar.
- `css/tokens.css` (variables), `css/app.css` (todo, móvil), `css/escritorio.css` (solo
  dentro de media queries anchas; no puede alterar el móvil).
- `js/app.js`: arranque, rutas por hash (`#inicio`, `#juego/123`...), barra inferior,
  carga perezosa de pantallas. Las 4 pestañas principales ya visitadas siguen montadas
  (ocultas, `.pantalla[hidden]`) y volver es instantáneo; lo demás se desmonta al salir.
  Lo que haga una pantalla oculta (títulos, celebraciones, gestos en window) mira `el.hidden`.
- Repintar: `pintarHtml(el, html)` (`js/ui.js`) en vez de `innerHTML` en lo que se actualiza
  con los datos: si el HTML es igual no toca nada; si cambia, solo los nodos afectados
  (clave: `data-k`, `href`, `id` o `src`; las imágenes no se recrean). `data-propio`: su
  contenido lo pinta otro código.
- `js/datos.js`: datos del grupo en memoria + caché IndexedDB, refresco por "huellas",
  escrituras optimistas con reversión. `js/metricas.js`: perfiles, tier list, rankings,
  comparar, horas (`sumarHoras`, `desgloseDe`, estimaciones), memoizado por versión.
- `js/navegacion.js` (`volver()` con respaldo, enlaces a perfiles), `js/instalar.js` (service
  worker, aviso de versión nueva, "Instalar app"), `js/version.js` (`__VERSION__`),
  `js/psn-nombres.js` (nombre limpio de un título de PSN), `js/ajustes.js` (la hoja de Ajustes).
- `js/notas.js` escala S-F. `js/sesion.js` + `js/codigo.js` login (por `entrar(hash)`: el
  hash no se puede leer con la clave pública; la sesión guarda también el hash, el id del
  dispositivo `cvj.dispositivo` y manda `latido()` al abrir y cada 20 min). `js/supabase.js`
  cliente (solo para escribir). `js/config.js` URL y clave pública.
- `js/ui.js` piezas HTML; `js/icons.js` iconos propios rellenos; `js/hoja.js` hoja
  inferior genérica; `js/portadas.js`, `js/color-dominante.js`.
- `js/hoja-valorar.js` valorar (estado, nota, plataformas, reseña, cuenta en ranking).
- `js/horas-ui.js` desglose de horas con control manual; `js/estimaciones.js` automático.
- `js/fusiones.js` "¿Es el mismo juego?"; `js/colecciones-ui.js`; `js/menu-juego.js`.
  `js/pantallas/editar-grupo.js`: editor de admin de una colección (#coleccion/{id}/editar) o
  saga (#saga/{id}/editar): nombre, portada, buscador para añadir varios (los que ya están,
  marcados), arrastrar para ordenar (tirador; en móvil, pulsación larga) con ↑/↓, "Por fecha" /
  "Por nombre", quitar con Deshacer, fusionar y eliminar u ocultar. Las sagas, en orden de salida.
  Etiqueta de una colección: `metricas.etiquetaColeccion(id, uid?)` ("Colección · 14 juegos" o
  "Colección · 6 de 14 jugados"), con los datos enteros, nunca con lo filtrado en pantalla.
- `js/seleccion.js` selección múltiple (pulsación larga: 580 ms en táctil, 480 con ratón; la tarjeta
  se hunde mientras se carga y vibra al activarse; en escritorio también Ctrl/Mayús+clic y el
  círculo que sale al pasar el ratón; en el modo, cualquier toque marca y nunca navega; se sale
  con la X, atrás, Esc o un toque CLARAMENTE fuera de la lista: no cuentan `[data-lista]` ni lo
  que esté a 24 px de una portada). En
  escritorio las hojas bloquean el scroll en `html` con `scrollbar-gutter: stable`: sin saltos; `js/deslizar.js` deslizar entre las pestañas
  principales (las de la barra, en su orden) siguiendo el dedo, también sobre la barra de abajo
  (vecina = foto que guarda app.js al salir, o esqueleto; indicador de la barra; lo que tiene
  scroll horizontal propio manda; llegar a Buscar deslizando no abre el teclado). Sobre una zona
  `[data-subdeslizar]` (`data-sub-i`, `data-sub-n`; el contenido en `[data-subpanel]`) cambia de
  subpestaña con el evento `cvj:subpestana` (el perfil): rebote en los extremos y nunca salta a
  otra pestaña principal en ese gesto. `js/seleccion-texto.js`: selección de texto PROPIA en
  táctil sobre SELECCIONABLE (pulsación larga = palabra, tiradores palabra a palabra con
  desplazamiento automático, resaltado con rectángulos propios, menú Copiar / Seleccionar todo /
  Citar en mi columna (`#escribir/nueva/cita[/juego/{id}]`, la cita en sessionStorage
  "cvj.cita") / Reaccionar; scroll de verdad, tocar fuera o atrás la cancelan). En escritorio y
  en el editor, la selección nativa;
  `js/galeria.js`; `js/refrescar.js` tirar para refrescar; `js/celebracion.js`.
- `js/barra.js`: barra de navegación del móvil personalizable (Inicio y "+" fijos; 2 a 4 más entre
  Buscar, Rankings, Perfil, Columnas, Tier list `#tierlist`, Estadísticas `#cifras`, Biblioteca
  `#biblioteca`, Cementerio, Propuestas y Avisos con contador; "Pestaña al abrir la app").
  `principales()` = las pestañas que se quedan montadas y el orden de deslizar. Se edita en
  `js/ajustes-barra.js` (vista previa, arrastrar, Restablecer). En escritorio, la barra lateral
  de siempre (`.barra-escritorio`; las del móvil, `.barra-movil`). El avatar de Inicio abre un
  menú con Mi perfil y Ajustes (que nadie se quede sin acceso).
- `js/psn.js`, `js/xbox.js`, `js/steam.js`, `js/igdb.js` + `js/ajustes-*.js`,
  `js/cuentas-ui.js`, `js/plataformas-ui.js`: plataformas y Ajustes.
- `js/apariencia.js`: fondos (cada uno ya es claro u oscuro; no hay ajuste de tema),
  modo automático día/noche, imagen propia medida (velo y sombra si hace falta) y acento:
  todo se resuelve en variables CSS inline en `<html>`.
  El acento que se ve tiene UN punto de entrada: `fijarAcentoDeRuta()` (`js/app.js`, según la
  ruta) → `acentoVisitado()`: en el perfil de otro (y su tier list, estadísticas, columna y
  entradas) se ve su acento (`usuarios.acento`; si nunca eligió, `ACENTO_DEFECTO` de
  `js/apariencia.js`, nunca el mío) sobre MI fondo, fundido en 250 ms (temporizador, no rAF). `js/ajustes-apariencia.js` su
  pantalla (vista previa en vivo). `js/encuadre.js` arrastrar y zoom (fondo y cabecera).
- `js/encuadre.js`: `abrirEncuadre` (un marco) y `abrirEncuadreDoble` (la imagen entera con los
  marcos Móvil / Escritorio, con la franja de abajo que se difumina sombreada, y vistas previas
  con la misma máscara y sombra que la cabecera; lo usa la cabecera del perfil).
- Prueba local: si el navegador sirve archivos viejos, es el service worker de `index.html`
  (registrado al abrir la raíz): quitarlo y vaciar `caches` en esa pestaña.
- `js/perfil-personal.js` (datos y cabecera del perfil: arte del favorito, imagen,
  degradado o patrón, con máscara para fundirse con el fondo), `js/cabecera-editar.js`,
  `js/perfil-editar.js`, `js/foto-perfil.js`, `js/acento.js` (paleta de colores de
  usuario), `js/selector-color.js`.
- `js/columnas-ui.js`: piezas de columnas (tarjetas y `markdown(texto, ctx)`: el MISMO HTML en la
  lectura y en la vista previa del editor). Además del Markdown ligero, bloques en sus líneas:
  `:::spoiler … :::` (tapado: "Spoiler · toca para ver"), `[[juego:ID]]` (tarjeta con la nota del
  autor y la del grupo), `>> frase` (cita destacada), `:::veredicto … :::` (`nota: 8.5` o una
  letra, `+ bueno`, `- malo`, `= frase`), `:::encuesta … :::` (pregunta y `- opción`, 2-4; solo
  la primera se vota) y `@Nombre` (mención); con 3 intertítulos o más, índice. Los `:::` no se
  anidan. `js/columnas-insertar.js`: el menú "Insertar" del editor y sus hojas (juego, capturas y
  arte de IGDB, spoiler, cita destacada, mención, veredicto, encuesta, portada) y la búsqueda
  rápida de "#" (juegos) y "@" (personas). Lectura (`js/pantallas/lectura.js`): tamaño de letra
  (3, `localStorage` "cvj.lectura.letra"), seguir donde lo dejaste ("cvj.lectura.pos"; en las
  listas "Vas por el 40 %"), "Leída", réplicas ("Escribir una réplica" →
  `#escribir/nueva/replica/{id}`) y, para el autor, "Tus números"; `cabeceraEntrada`,
  `clicContenido` y `tamLetra` los comparte con la vista previa del editor.
- Perfil en pestañas (`js/pantallas/perfil.js`): bajo la cabecera (foto, nombre, bio, estado,
  datos, top 3, insignias compactas y "Columnista de …"), una barra fija al bajar: Historial ·
  Tier list · Estadísticas · Biblioteca · Columna (si tiene). Cambia ahí mismo, sin navegar; la
  última se recuerda (`localStorage` "cvj.perfil.pestana"). Rutas: `#perfil/{id}/{tiers|
  estadisticas|biblioteca|columna}`; `#estadisticas/{id}` lleva a la de Estadísticas. En
  escritorio, datos a la izquierda (fijos) y pestañas a la derecha. El contenido de Tier list,
  Estadísticas y Columna sale de `js/vistas-perfil.js` (también lo usan `#columna/{id}` y
  Rankings). Rankings: Ranking · Tier list · Estadísticas · Comparar; `#rankings/tiers/{id|grupo}`
  y `#rankings/estadisticas/{id|grupo}` con la fila de personas; "Grupo" = tier list con la nota
  media de todos (`metricas.tierListGrupo(min)`: por defecto 2 notas o más; "Incluir juegos de una
  sola persona" en `localStorage` "cvj.tiers.solos") y las estadísticas del grupo. Las tier lists
  tienen dos vistas: compacta (cada rango en una fila con scroll horizontal, "+N" y la letra que
  despliega el rango) y completa; por defecto compacta en móvil y completa en escritorio, y la
  elección va en la cuenta (`usuarios.preferencias.tiers`, migración 049; `js/preferencias.js`),
  también en Ajustes.
  El contenido de cualquier tier list sale de `datosTiers(lista)` (`'u:{id}'` o `'grupo'`) de
  `js/vistas-perfil.js`, ya en su orden. En MI tier list, modo "Ordenar": arrastrar dentro de cada
  rango (el rango lo sigue decidiendo la nota) y "Ordenar por…" (nota, nombre, salida, cuándo lo
  jugué, horas; todos los rangos o uno, con confirmación); se guarda en `usuarios.tiers_orden`
  (`{"j:ID"|"c:UUID": posición}`, migración 050) y lo ven así también los demás. "Compartir
  como imagen" al final de todas: `js/tier-imagen.js` (canvas a 2x = 1080 px de ancho, 9:16,
  1:1 o completo; máximo por rango con "+N" que ocupa un hueco; quitar juegos tocándolos en la
  vista previa; nota y horas; título; fondo del tema o del acento; Compartir con Web Share y el
  archivo si `navigator.canShare({files})`, si no o en escritorio, Descargar).
- Estadísticas (`htmlEstadisticas` / `htmlEstadisticasGrupo` de `js/vistas-perfil.js`): resumen
  compacto, revelaciones (placer culpable, más duro/blando, década, estudio, saga, especialidad),
  ADN de jugador (radar de los 8 géneros más jugados del grupo, raíz del reparto, "Comparar con"),
  géneros favoritos (por juegos / horas / nota, con portadas), anillos de temas, modos y
  perspectiva, "Tu año en juegos" (mapa de calor; la actividad del año se pide aparte:
  `datos.actividadAnual(uid)` → `{estado: cargando|listo|error, filas}`, filas siempre las que haya
  para pintar ya; las "puestas al día" = ráfagas de 6+ en 10 min, no cuentan para el color y el día
  sale marcado aparte; tocar un día abre lo de ese día y, con ratón, al pasar sale un globo) y
  plataformas y horas (nombres cortos: "Quest 2"). Grupo: juego que más une, ADN, géneros,
  especialistas (el que más parte de lo suyo dedica a ese género), curiosidades, anillos. Con
  pocos datos (menos de 5 juegos con ese dato) la sección no sale. Tocar un trozo abre sus juegos
  (`clicEstadisticas`, que llaman perfil y Rankings; `observarGraficos` anima al entrar en
  pantalla). Datos en `js/clasificacion.js` (agrupa etiquetas finas: `AGRUPAR`; regla de
  colecciones, versiones, horas totales y `cuentaEnRanking`); SVG a mano en `js/graficos.js`
  (colores `--s0..--s6` derivados del acento en `.graf`). En escritorio, las columnas dependen del
  ancho del contenedor (`@container`), no de la ventana.
- `js/insignias.js`: catálogo de insignias (condiciones), medallas SVG, cálculo memorizado
  por versión de datos, guardado de cambios tras cada refresco, avisos y vitrina del perfil.
  Los degradados de las medallas van UNA vez en `<svg id="ins-defs">` del body (`defsMedalla`):
  nunca `<defs>` dentro de cada SVG repetido (un id duplicado en una pantalla oculta las deja sin color).
- `js/cementerio.js`: vidas y muertes (`historia(uid)`), récords, epitafios, reanimaciones
  (cuenta atrás, vetar/permitir), acceso de Inicio, avisos de reanimación y filas de la
  actividad. El admin firma como "El Dictador" en el cementerio y en los vetos.
  `js/pantallas/cementerio.js` (#cementerio): lápidas (selladas si está exorcizado), velas
  y Reanimar. En escritorio, enlace discreto al pie de la barra lateral.
- `js/propuestas.js`: propuestas de nuevos miembros (recuento y orden por apoyo, padrino,
  `ahijados()` para las insignias, acceso "+" de "El grupo", aviso de Inicio de las que no he
  votado, filas de la actividad). `js/pantallas/propuestas.js` (#propuestas, #propuestas/{id}):
  proponer, votar (hoja con comentario) y, el admin, Invitar (abre `anadirPersona()` de
  `js/ajustes-grupo.js` con el nombre puesto), Aparcar o Rechazar (con motivo).
- `js/apelaciones.js`: apelaciones de los expulsados (aviso de Inicio y hoja del admin con
  Aceptar/Rechazar, sección de Gestionar grupo, "Ha apelado N veces", filas de actividad).
  `js/pantallas/difunto.js`: lo que ve un expulsado en vez del login (su lápida y Apelar);
  `sesion.js` guarda `cvj.difunto` ({id, hash}); al expulsarle NO se borra su identidad del
  dispositivo y, si vuelve, entra solo (con el hash o con `entrar_dispositivo()`).
- `js/tutorial.js`: mini tutoriales de Cementerio y Propuestas (3 tarjetas animadas que se
  deslizan, con "Saltar"; ilustraciones de iconos propios, animaciones `.tut-*`). Salen solos la
  primera vez que se entra en la sección en ese dispositivo (`localStorage` "cvj.tutorial.{id}";
  esperan a que no haya nada encima, y el "Mientras no estabas" espera a que se cierren) y luego
  con "¿Cómo funciona?" de la cabecera.
- `js/llamada.js` + `js/pantallas/llamada.js` (#llamada/{token}, con o sin sesión): enlaces de
  confirmación de reanimar y proponer (hoja que dice en grande "Ahora mándale este enlace a
  {nombre}" con Compartir/Copiar y texto listo, página con
  "Aceptar" sin pedir datos, botón "Escribir al Dictador" por wa.me con mensajes graciosos).
- `js/eventos.js`: eventos destacados (galas: TGA, Summer Game Fest, Directs...): activos,
  banner de Inicio (cuenta atrás; se cierra por persona en localStorage hasta que sube
  `aviso_version`), categorías incluidas, voto/pronóstico, resúmenes del grupo, veredicto de
  CVJ, porra, etiqueta de la ficha ("Nominado · TGA 2026 · …"), actividad y celebración.
  En la interfaz: "Mi favorito" (tipo `voto`) y "Mi apuesta" (tipo `pronostico`, lo que puntúa).
  Banner: sin X hasta la gala; botón "Hacer / Seguir mi porra (8/24) / Ver la porra".
  `js/pantallas/papeleta.js` (#evento/{id}/papeleta(/{categoria}): una categoría por pantalla,
  favorito → apuesta → siguiente sola; "Atrás", "Saltar", deslizar; al final "Tu papeleta").
  `js/pantallas/evento.js` (#evento/{id}: consulta; mi papeleta, porra, oficial, veredicto y
  categorías plegables en lectura que abren la papeleta en esa categoría; la chuleta) y
  `js/pantallas/evento-editar.js` (#evento/{id}/editar, #evento/nuevo: solo admin; se llega
  desde Ajustes → Eventos).
- `js/avisos.js`: notificaciones (un solo sistema de avisos): textos por tipo, botón con
  contador (cabecera de Inicio en móvil; en escritorio, la `.esquina` de `js/app.js`: arriba a la
  derecha con mi avatar, en todas las pantallas; la barra lateral no lo lleva), abrir uno = ir al sitio
  exacto (`destino` + `datos.destacar`, resaltado con `.destacado-aviso`) y marcarlo leído,
  "Mientras no estabas" (al abrir la app o volver tras 5 min: carrusel con las 5 más
  importantes sin ver; sustituye a las capas de insignias y "¡Completado!") y Ajustes →
  Notificaciones. `js/pantallas/avisos.js` (#avisos): por días y filtros; al entrar se marcan
  todos como leídos y los que eran nuevos siguen resaltados durante esa visita.
  En Inicio ya no van avisos sueltos (solo el del Dictador con Vetar / Permitir ya).
- `js/social.js`: reacciones y respuestas (tira bajo reseñas y entradas, menú, hilo y
  filas de actividad).
- `js/pantallas/`: `inicio`, `buscar`, `juego`, `perfil`, `rankings`
  (+ comparar), `estadisticas` (ruta antigua → perfil), `coleccion`, `saga`, `revisar`, `duplicados`, `entrada`
  (login), `escribir` (editor de columna), `lectura` (#entrada/{id}), `columna`,
  `columnas` (todas; en móvil se llega desde Inicio, en escritorio desde la barra lateral),
  `cementerio` y `propuestas` (desde el final de "El grupo" en Inicio).
- `prueba-local.html` (solo en este equipo: excluido en `.git/info/exclude`): la app con
  un Supabase simulado en memoria, para probar en local
  (`.claude/launch.json` → `cvj-local`: `herramientas/servidor-local.py`, sin caché,
  puerto 8766; sin service worker; `localStorage['prueba.escenario'] = 'fase3'` trae
  columnas, entradas, reacciones e insignias; el cementerio (difuntos, un exorcizado con
  3 muertes, una reanimación en curso, `window.__cementerio.completar()` = la tarea
  programada), las apelaciones (`window.__apelaciones`; `localStorage['prueba.difunto'] =
  'u-gonzalo'` abre la app como ese expulsado; códigos GONZA2, NACHO2, RUBEN2), los eventos
  (`prueba-eventos.json`, también excluido: copia del evento real con sus juegos) y las propuestas (abiertas, una aparcada, Mateo entró por una, una rechazada;
  `window.__propuestas`) salen en cualquier escenario menos `vacio`; `window.__fallar = true` simula sin red).
  `localStorage['prueba.escenario'] = 'real'`: las tablas reales desde `prueba-real.json` (excluido
  de git; copia de solo lectura sin códigos ni tokens) para comprobar números con datos reales;
  entra como el admin o `localStorage['prueba.yo']`. Las capturas del panel salen recortadas en
  móvil emulado: mejor un iframe de 390 px en escritorio. Barrido de todas las rutas (errores de
  consola, peticiones fallidas, desbordes, textos raros): `herramientas/barrido.js` (también
  excluido; en la consola: `await (await import('/herramientas/barrido.js')).barrer()`). El
  simulado no tiene `estado_servicios` ni `celebraciones_vistas` (sus 404 no son fallos).
- `herramientas/`: restaurar copia (`RESTAURAR.md`, `restaurar-copia.sh`), pruebas de
  PSN/Xbox/buscador, generar iconos y hash de código.
- `cvj-diseno/`: diseño original de referencia (no se publica).
- `supabase/migrations/`: esquema numerado `2026110700NNNN_nombre.sql`; la siguiente
  usa el número siguiente. Escribirlas idempotentes (`if not exists`, `create or replace`).

## Modelo de datos (public)
- `usuarios`: nombre, inicial, color, acento, `codigo_hash`, `es_admin`, `activo`
  (false = expulsado, en el cementerio: no entra ni sale en listas, sus datos cuentan),
  `exorcizado` (expulsión permanente: nadie lo reanima hasta que el admin lo levante), `apariencia` (jsonb `{v: 2, modo
  fijo|auto, fondo, dia, noche, imagen:{url, desenfoque, velo, texto, x, y, zoom, medida}}`;
  lo de antes se migra solo al abrir), `perfil_datos` (bio, estado, plataforma, favorito,
  vitrina, insignias, `cabecera:{tipo, arte|imagen, x, y, zoom (encuadre MÓVIL), esc:{x, y, zoom}
  (encuadre ESCRITORIO; sin él, el mismo foco), intensidad}`: proporción FIJA, la de los marcos
  del encuadre (`ASPECTO_CAB`): móvil 39:28 sin contar la zona segura (va aparte, difuminada:
  `.cab-tope`), escritorio (≥ 768 px) 7:2 en todos los anchos (más de 1680 px: se centra y se
  funde por los lados). Si cambia una, cambian las dos (CSS y `ASPECTO_CAB`)),
  `umbral_probados`, `estimar_horas`, `plataformas_ocultas`, `barra` (`{pestanas, inicio}`,
  migración 048; copia local "cvj.barra"), `preferencias` (jsonb de interfaz: `tiers`; migración
  049), `tiers_orden` (orden manual de su tier list; migración 050).
- `juegos` (PK `igdb_id`): caché de IGDB + `es_online`(_manual) = sin final,
  `relaciones` (jsonb de IGDB), `ttb_*` tiempo para terminar (sin imposibles: > 300 h historia,
  600 extras, 1500 completo; migración 046), `generos`, `temas`, `modos`, `perspectivas`,
  `desarrolladoras`, `franquicia` (traducidos en la función; `temas` null = sin clasificar;
  migración 045), `mostrar_como` (versión
  cuya portada/nombre se enseña), `arte_id`/`arte_tipo` arte horizontal de IGDB (artwork o
  captura; `t_1080p`; acción "arte", cron cada hora) y `artes` (todas las apaisadas, acción
  "artes", al editar la cabecera).
- `juegos_alias` (alias → principal, `auto`): versiones fusionadas. `versiones_separadas`:
  lo que el admin separó (no se vuelve a fusionar solo). `fusiones_rechazadas`: "son
  distintos" por usuario.
- `valoraciones` (usuario, juego): `estado` jugando/completado/abandonado/pendiente,
  `nota` 0-10, `recomendado`, `resena`, `plataformas[]`, `cuenta_ranking`, `rejugado`
  (marca sí/no, migración 044: sin contador de vueltas), `rejugando` (estado "Rejugando":
  sigue completado), `jugando_desde`. Se quedan en la versión jugada; cuentan en el principal.
- `colecciones` + `colecciones_juegos` (`orden`: lo nuevo va tras el MAYOR orden, no tras el
  número de juegos) + `valoraciones_coleccion`: juegos que cuentan
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
  `cuerpo` texto ≤ 100 000, sobre juego/colección/saga, `replica_de`, `portada` https; migración
  047) → `lecturas` (de todos; solo se apuntan al leer de verdad: final del texto + unos
  segundos, o un rato a la vista; `al_final` = llegó al final) y `encuestas_votos` (una por
  persona y entrada: `opcion` 0-3; no va en `huellas()`: se pide en cada refresco). Avisos
  `mencion` ("@Nombre" en una publicada, una vez por entrada) y `replica` (al autor de la
  original), por disparador en `entradas`.
- `reacciones` (una por usuario y objetivo: buena/mala/acuerdo/discrepo/wtf) y
  `comentarios` (respuestas ≤ 500): `objetivo` = valoracion | valoracion_coleccion |
  entrada + `objetivo_id`. Se borran solos con su reseña o entrada (trigger).
  `usuarios.social_visto_en`: hasta cuándo vio cada uno lo nuevo de lo suyo.
  Todo lo social va en `js/social.js` y se repinta en su sitio (`datos.suscribirSocial`).
- `insignias` (personales: usuario, insignia, nivel 1-3; no bajan salvo las marcadas
  `recalcular` al cambiar su regla, sin avisos) e `insignias_grupo` (una fila por insignia:
  dueño actual, anterior, desde; las de pareja con `otro_id`/`otro_anterior_id`). `inicial`
  = calculada al estrenar (no sale en la actividad). `usuarios.insignias_visto_en` para los
  avisos; la vitrina elegida va en `perfil_datos.insignias`. NO salen en la actividad de Inicio:
  solo se avisa a los afectados, y los avisos de insignias seguidos (20 min) van juntos en uno,
  con la causa si hubo una muerte o una vuelta justo antes (`agrupar()` de `js/avisos.js`). Las condiciones viven en el
  cliente (`js/insignias.js`). Catálogo oculto: cada uno ve solo las suyas y las vitrinas
  de los demás (nada de bloqueadas, pistas ni "X de 30"). Las de grupo tienen que depender
  de lo que hacen los demás (nada que se consiga a solas farmeando).
- El cementerio (migración 036): `vidas` (historial por usuario: alta, expulsion,
  reanimacion_pedida, reanimacion, veto, exorcismo, exorcismo_levantado; fecha, `autor_id`,
  `causa` ≤ 140; se puede morir y volver varias veces), `reanimaciones` (intentos: 12 h,
  uno en curso por difunto, el mismo autor no repite con el mismo difunto en 7 días; estado
  en_curso/completada/vetada/anulada) y `velas` (una por persona y lápida). La app solo
  lee `vidas` y `reanimaciones`: se escriben con `pedir_reanimacion()` (RPC, cualquiera
  activo), `admin_vida()` (función admin) y `completar_reanimaciones()` (pg_cron
  `cvj-reanimar` cada 5 min: vuelve solo, con su mismo código). Altas nuevas: trigger.
  Salen en la actividad desde `vidas` (no en `actividad`). Si el autor de una columna está
  muerto, se lee como "Legado de {nombre}" y no publica; al volver, es suya otra vez.
- Propuestas (migración 037): nadie invita; se propone, se vota y decide el admin.
  `propuestas` (autor, nombre, `de_que`, `motivo` ≤ 300, `plataformas[]`, estado
  abierta/aparcada/aceptada/rechazada, `motivo_rechazo`, `usuario_id` = quien entró) y
  `propuestas_votos` (uno por persona: favor/contra + comentario ≤ 140; públicos; se pueden
  cambiar o quitar mientras no esté decidida). `usuarios.propuesta_id` = por cuál entró
  (de ahí "Entró por propuesta de…", "Propuesto por…" en la lápida y las insignias Buen
  padrino / Mal padrino). Solo lectura desde la app: `proponer()` (máx. 2 abiertas por
  persona; el que propone vota a favor solo; un rechazado no vuelve hasta 30 días),
  `votar_propuesta()` y `admin_propuesta()`. Salen en la actividad desde `propuestas`.
- Confirmación del interesado (migración 043): reanimar y proponer quedan PENDIENTES hasta
  que el interesado acepta en su enlace (`enlaces`, PRIVADA: token de un uso; 72 h reanimar,
  7 días proponer; caducan en `completar_reanimaciones()`). Reanimaciones: pendiente →
  en_curso (aceptó con su código o desde un dispositivo que le reconoce: 12 h de veto) |
  sin_codigo (solo vuelve si el admin aprueba: "Permitir" + código nuevo) | caducada ("no
  respondió a la llamada"); `caduca_en`, `respondida_en`, `termina_en` solo desde que responde.
  Propuestas: esperando → abierta (ya se vota; el aviso a todos sale entonces) | caducada.
  Antiengaño en `aceptar_enlace()`: no desde el navegador con la sesión de alguien activo ni
  desde un dispositivo (30 días) o IP (7 días, hash; en IPv6 su /64) de alguien activo
  (`accesos`, PRIVADA, la llena `latido()`). Reconocido = dispositivo donde entró con su
  código (`accesos.verificado`). El WhatsApp del Dictador en `ajustes_privados` (solo sale en
  `ver_enlace()` / `estado_difunto()`). `usuarios`: anon no lee `codigo_hash` ni cambia
  id/codigo_hash/es_admin/activo/exorcizado/propuesta_id/creado_en ni inserta: **una columna
  nueva en usuarios necesita su `grant select (col)` (y `grant update (col)` si la cambia la
  app)**, o la carga de datos falla.
- Apelaciones (migración 038): `apelaciones` (pública: usuario, estado pendiente/aceptada/
  rechazada, `exorcizado`, fechas) y `apelaciones_textos` (PRIVADA, sin acceso anon: texto ≤ 500
  y respuesta ≤ 300; la lee el admin por la función `admin` y el difunto con su código vía
  `estado_difunto()`). Se apela con `apelar(hash, texto)`: código comprobado en el servidor, una
  pendiente a la vez, 7 días tras un rechazo, exorcizados una cada 30 días. Aceptar
  (`admin_apelacion()`) = vidas `reanimacion` con `apelacion_id` (y `exorcismo_levantado` si
  estaba sellado), mismo código. Si vuelve por otro camino, la pendiente se cierra sola.
- Eventos (migración 039): `eventos` (título, siglas, texto, imagen subida o arte de
  `juego_imagen_id`, color, inicio/fin, `fecha_clave` = la gala, `votacion_fin`, enlace,
  `aviso_version`, `resultados_en`, `foco_x`/`foco_y` = punto de enfoque de la imagen, usado como
  `object-position` en todos los tamaños), `eventos_categorias` (orden de la web oficial, tipo
  juegos|texto, `incluida`, `principal`, `peso` en la porra, `ganador_id`),
  `eventos_nominados` (con `juego_id` de IGDB), `eventos_elecciones` (por persona y categoría:
  `voto` = a quién quiero que gane, lo que voto en la oficial; `pronostico` = quién creo que
  ganará, lo único que puntúa; bloqueadas desde `fecha_clave` por trigger) y `eventos_votado`.
  Escritura con la clave pública. Las categorías no incluidas no se ven ni puntúan, pero lo
  elegido se guarda. Los pronósticos ajenos solo se ven tras hacer el tuyo (en el cliente).
  The Game Awards no tiene API: se vota en su web; CVJ solo ayuda (chuleta).
- Notificaciones (migración 040): `notificaciones` (por usuario: tipo, categoria mi|grupo,
  `clave` para agrupar lo repetido mientras no se lea (actores, n), datos, destino, prioridad,
  leida, en_resumen). Las generan disparadores en el servidor (reacciones, comentarios,
  lecturas, entradas, insignias, vidas, propuestas y votos, apelaciones, actividad, eventos)
  con `notificar()` / `notificar_todos()`; lo del reloj, la tarea `cvj-avisos` (15 min). La app
  solo lee las suyas y marca con `marcar_avisos()`. `usuarios.avisos_resumen` = grupos apagados
  en el resumen al entrar. Un tipo nuevo de aviso: disparador + texto en `js/avisos.js`.
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
    no la toca el automático; borrar = `descartada`. Nunca en juegos sin final ni con tiempos
    imposibles (`datos.MAX_TTB`).
- **Colecciones vs sagas**: colección = un solo juego a efectos de nota y horas (la crea el
  admin); saga = agrupación visual de juegos que se valoran por separado (automática).
- **Regla única de las colecciones**: si un juego está en una colección, NUNCA sale suelto.
  En el historial, la biblioteca, la tier list, las estadísticas, comparar y los rankings de
  cualquiera va dentro de una sola tarjeta de la colección, aunque tenga nota propia
  (`metricas.itemsDe(uid)`, `valoracionesColeccionDeUsuario`, `agruparColecciones`). Nota
  de la tarjeta: la suya de la colección o, si no, la heredada de sus juegos (el de más horas
  o el más reciente; `desdeJuego`). La ficha de la colección enseña sus notas y horas por
  juego; la ficha de cada juego, su nota propia o heredada. Todo sale de los índices: añadir o
  quitar un juego lo recoloca todo al momento. ("Jugando ahora" enseña el juego concreto.)
- **Rejugado**: marca sí/no por usuario y juego (`valoraciones.rejugado`). Se pone al elegir
  "Rejugando" o a mano en Valorar ("Lo he rejugado"); se quita ahí o con "No lo he rejugado"
  en mi fila de la ficha. Se ve como un detalle sutil (`marcaRejugado()` de `js/ui.js`: icono
  pequeño con "Rejugado" al tocar o pasar el ratón) y "Rejugado por …" en la ficha. Para todo
  lo demás cuenta como su estado. La insignia "Otra vuelta" cuenta juegos con la marca.
- **Fusiones**: automáticas (`fusionar_versiones()`): ediciones, ports, remasters y
  ampliados se funden en el original; remakes no; tampoco si el original es prólogo/demo/
  episodio. Ante la duda, tarjeta "¿Es el mismo juego?" (fusión manual o rechazo por
  usuario). El admin puede separar versiones y elegir la portada/nombre a enseñar.
- **Admin** (`es_admin`): gestionar grupo (vía función `admin`), expulsar (con causa de la
  muerte opcional), exorcizar, levantar exorcismos, devolver a la vida, vetar o permitir ya
  una reanimación, columnas, colecciones, sagas, sin final, separar versiones. La interfaz oculta esas acciones al resto.

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
- **Nada se queda cargando para siempre**: las peticiones llevan límite (`datos.conLimite`,
  `senalConLimite`; `api()` y la función de IGDB, 25 s). Lo que espera a los datos del grupo usa
  `datos.estadoCarga()` (frescos / cargando / fallo a los 15 s o si falla) y `esperaDatos()` de
  `js/ui.js` ("Cargando…", "no existe" o el error con Reintentar: `data-reintentar-datos`, lo
  atiende `js/app.js`). Cada pantalla con algo que pide aparte tiene su error y su Reintentar.
- Despliegas y migras tú (commit + push a main). En "LO QUE TIENES QUE HACER TÚ" solo lo
  imprescindible que no se pueda hacer desde aquí.
- Sin emojis en la interfaz; iconos propios rellenos (`js/icons.js`).
- Texto no seleccionable salvo reseñas, entradas de columnas y respuestas (`SELECCIONABLE`
  en `js/ui.js`): ahí, en táctil, nuestra selección (`js/seleccion-texto.js`); con ratón, la del
  navegador. No entra en selección múltiple ni menús (la pulsación larga sobre la tarjeta sí).
- Comprobar la sintaxis de los módulos con `node --input-type=module --check < archivo.js`
  (`node --check archivo.js` no ve algunos errores que rompen el módulo en el navegador).
- Cambios pequeños de aspecto: sin pruebas. Lo importante se prueba con datos reales.
- Cifras grandes con `miles()` de `js/ui.js` ("4 279", espacio que no parte). Una fila-enlace
  con subtítulo: `.enlace-fila` + `.enlace-fila-texto` con `<small>` (vale `<a>` o `<button>`).
- Botones y espaciado: sistema común en `css/tokens.css` (`--esp-1..6` = 4/8/12/16/24/32,
  `--boton-alto` 48 y `--boton-alto-peq` 36 como mínimo, `--boton-radio`). Principal,
  secundario (`.neutro`, `.peligro`) y de texto (`.enlace-discreto`); `.boton-pequeno` el
  tamaño pequeño (en móvil el área táctil llega a 44 px). Botones juntos en fila: dentro de
  `.fila-botones` (mismo ancho y separación). No poner alturas ni radios sueltos por pantalla.
- Móvil primero (390 px de ancho). La versión de escritorio va en `css/escritorio.css`
  y no puede cambiar nada del móvil.
- Commits en español, descriptivos (qué cambia para el usuario). Migración en un commit
  propio antes del código que la usa.
