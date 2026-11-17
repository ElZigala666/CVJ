-- =============================================================================
-- CVJ · Eventos destacados (galas y presentaciones: The Game Awards, Summer Game Fest,
-- Directs...). Los crea y edita el admin desde Ajustes; mientras están activos salen en un
-- banner de Inicio con cuenta atrás hasta su fecha clave.
--
--  · eventos: título, texto corto, imagen (subida o arte de un juego), color, fechas
--    (inicio, fin, fecha clave = la gala, cierre de la votación oficial), enlace externo
--    con su texto, siglas para las etiquetas ("TGA 2026"), aviso_version (si sube, el
--    banner vuelve a salir a quien lo cerró) y resultados_en (ganadores publicados).
--  · eventos_categorias: en el mismo orden que la web oficial; tipo juegos|texto
--    (actuación, creador de contenido...); incluida (el admin quita las que sobran: no
--    salen ni puntúan, pero lo elegido se guarda); principal (atajo "Solo las principales");
--    peso en la porra; ganador_id.
--  · eventos_nominados: por categoría, con su juego de IGDB si lo es.
--  · eventos_elecciones: por persona y categoría, "voto" (a quién quiero que gane, lo que
--    voto en la oficial) y "pronostico" (quién creo que ganará: la porra). Independientes.
--    Se pueden cambiar hasta la fecha clave; desde ahí, bloqueadas (trigger).
--  · eventos_votado: "Ya he votado en la oficial".
-- Como el resto de la app (grupo de confianza), se lee y escribe con la clave pública; lo
-- que no debe cambiar tras la gala lo para el trigger.
-- =============================================================================

create table if not exists public.eventos (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null check (char_length(btrim(titulo)) between 1 and 80),
  siglas           text check (siglas is null or char_length(siglas) <= 24),
  texto            text check (texto is null or char_length(texto) <= 280),
  imagen_url       text,
  juego_imagen_id  bigint,
  color            text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  inicio           timestamptz not null default now(),
  fin              timestamptz not null,
  fecha_clave      timestamptz,
  etiqueta_clave   text check (etiqueta_clave is null or char_length(etiqueta_clave) <= 40),
  votacion_fin     timestamptz,
  enlace_url       text check (enlace_url is null or enlace_url ~ '^https://'),
  enlace_texto     text check (enlace_texto is null or char_length(enlace_texto) <= 40),
  aviso_version    integer not null default 1,
  resultados_en    timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create table if not exists public.eventos_categorias (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references public.eventos(id) on delete cascade,
  nombre      text not null check (char_length(btrim(nombre)) between 1 and 80),
  orden       integer not null default 0,
  tipo        text not null default 'juegos' check (tipo in ('juegos', 'texto')),
  incluida    boolean not null default true,
  principal   boolean not null default false,
  peso        integer not null default 1 check (peso between 1 and 5),
  ganador_id  uuid
);
create index if not exists eventos_categorias_evento_idx on public.eventos_categorias (evento_id, orden);

create table if not exists public.eventos_nominados (
  id            uuid primary key default gen_random_uuid(),
  categoria_id  uuid not null references public.eventos_categorias(id) on delete cascade,
  orden         integer not null default 0,
  nombre        text not null check (char_length(btrim(nombre)) between 1 and 120),
  detalle       text check (detalle is null or char_length(detalle) <= 120),
  juego_id      bigint
);
create index if not exists eventos_nominados_categoria_idx on public.eventos_nominados (categoria_id, orden);
create index if not exists eventos_nominados_juego_idx on public.eventos_nominados (juego_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_categorias_ganador_fk') then
    alter table public.eventos_categorias add constraint eventos_categorias_ganador_fk
      foreign key (ganador_id) references public.eventos_nominados(id) on delete set null;
  end if;
end $$;

create table if not exists public.eventos_elecciones (
  categoria_id    uuid not null references public.eventos_categorias(id) on delete cascade,
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  tipo            text not null check (tipo in ('voto', 'pronostico')),
  nominado_id     uuid not null references public.eventos_nominados(id) on delete cascade,
  actualizado_en  timestamptz not null default now(),
  primary key (categoria_id, usuario_id, tipo)
);

create table if not exists public.eventos_votado (
  evento_id   uuid not null references public.eventos(id) on delete cascade,
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  votado_en   timestamptz not null default now(),
  primary key (evento_id, usuario_id)
);

-- Lectura y escritura con la clave pública (como colecciones, sagas...).
do $$
declare t text;
begin
  foreach t in array array['eventos', 'eventos_categorias', 'eventos_nominados', 'eventos_elecciones', 'eventos_votado'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "publico_todo" on public.%I', t);
    execute format('create policy "publico_todo" on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Elecciones: el nominado tiene que ser de esa categoría, y desde la fecha clave (la gala)
-- no se puede elegir, cambiar ni quitar nada.
create or replace function public.eventos_elecciones_comprobar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cat uuid := coalesce(new.categoria_id, old.categoria_id);
  clave timestamptz;
begin
  select e.fecha_clave into clave from public.eventos_categorias c join public.eventos e on e.id = c.evento_id where c.id = cat;
  if clave is not null and now() >= clave then
    raise exception 'La gala ya ha empezado: las elecciones están cerradas.' using errcode = 'P0001';
  end if;
  if tg_op <> 'DELETE' and not exists (select 1 from public.eventos_nominados where id = new.nominado_id and categoria_id = new.categoria_id) then
    raise exception 'Ese nominado no es de esta categoría.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists eventos_elecciones_comprobar on public.eventos_elecciones;
create trigger eventos_elecciones_comprobar before insert or update or delete on public.eventos_elecciones
  for each row execute function public.eventos_elecciones_comprobar();

-- El ganador tiene que ser de su categoría.
create or replace function public.eventos_ganador_comprobar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ganador_id is not null and not exists (select 1 from public.eventos_nominados where id = new.ganador_id and categoria_id = new.id) then
    raise exception 'El ganador tiene que ser de esta categoría.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists eventos_ganador_comprobar on public.eventos_categorias;
create trigger eventos_ganador_comprobar before insert or update of ganador_id on public.eventos_categorias
  for each row execute function public.eventos_ganador_comprobar();

-- Al publicar resultados, el banner vuelve a salir a quien lo cerró.
create or replace function public.eventos_tocar()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  if new.resultados_en is distinct from old.resultados_en and new.resultados_en is not null then
    new.aviso_version := old.aviso_version + 1;
  end if;
  return new;
end $$;
drop trigger if exists eventos_tocar on public.eventos;
create trigger eventos_tocar before update on public.eventos for each row execute function public.eventos_tocar();

-- huellas(): con los eventos.
create or replace function public.huellas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usuarios', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from usuarios t) x),
    'valoraciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from valoraciones t) x),
    'juegos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'resumen' - 'ttb_en' - 'arte_en' - 'artes' - 'artes_en')::text) h from juegos t) x),
    'actividad', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from actividad t) x),
    'biblioteca', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'actualizado_en')::text) h from biblioteca t) x),
    'psn_igdb', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from psn_igdb t) x),
    'juegos_alias', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from juegos_alias t) x),
    'fusiones_rechazadas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from fusiones_rechazadas t) x),
    'sagas_usuario', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from sagas_usuario t) x),
    'estado_servicios', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'actualizado_en')::text) h from estado_servicios t) x),
    'cuentas_plataforma', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from cuentas_plataforma t) x),
    'horas_extra', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from horas_extra t) x),
    'avisos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from avisos t) x),
    'colecciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from colecciones t) x),
    'colecciones_juegos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from colecciones_juegos t) x),
    'valoraciones_coleccion', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from valoraciones_coleccion t) x),
    'sagas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from sagas t) x),
    'sagas_juegos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from sagas_juegos t) x),
    'columnas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from columnas t) x),
    -- Entradas: sin el texto (no se descarga con la lista y puede ser muy largo).
    'entradas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'cuerpo')::text) h from entradas t) x),
    'lecturas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from lecturas t) x),
    'horas_ajustes', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from horas_ajustes t) x),
    'horas_estimadas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from horas_estimadas t) x),
    'celebraciones_vistas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from celebraciones_vistas t) x),
    'reacciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from reacciones t) x),
    'comentarios', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from comentarios t) x),
    'insignias', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from insignias t) x),
    'insignias_grupo', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from insignias_grupo t) x),
    'vidas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from vidas t) x),
    'reanimaciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from reanimaciones t) x),
    'velas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from velas t) x),
    'propuestas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from propuestas t) x),
    'propuestas_votos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from propuestas_votos t) x),
    'apelaciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from apelaciones t) x),
    'eventos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos t) x),
    'eventos_categorias', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos_categorias t) x),
    'eventos_nominados', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos_nominados t) x),
    'eventos_elecciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos_elecciones t) x),
    'eventos_votado', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos_votado t) x)
  );
$$;
revoke all on function public.huellas() from public;
grant execute on function public.huellas() to anon, authenticated, service_role;
