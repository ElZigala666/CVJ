-- =============================================================================
-- CVJ · Migración 006 · Biblioteca limpia
--   colecciones, confianza del emparejamiento, revisión tras sincronizar,
--   fusiones de versiones del mismo juego y sagas agrupadas.
-- Pégala entera en Supabase → SQL Editor → New query → Run.
-- Necesita la 003, 004 y 005 (ya ejecutadas). Se puede ejecutar más de una vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- juegos.relaciones: lo que IGDB sabe del juego (lo rellena la función igdb):
--   { tipo, version_parent, parent_game, remakes, remasters, ports,
--     expanded_games, bundles, colecciones: [{id, nombre}], franquicias: [...] }
-- -----------------------------------------------------------------------------
alter table public.juegos add column if not exists relaciones jsonb;

-- -----------------------------------------------------------------------------
-- psn_igdb (emparejamiento compartido de un título de PSN)
--   tipo: 'juego' | 'coleccion' (bundle: sus juegos en "juegos") | 'no_juego'
--         (apps, demos, betas...: se ocultan solas)
--   confianza: 0-100. Se acepta solo con 75 o más; por debajo, igdb_id queda
--   vacío y propuesta_id guarda la mejor propuesta para "Revisa tu biblioteca".
-- -----------------------------------------------------------------------------
alter table public.psn_igdb add column if not exists tipo text not null default 'juego';
alter table public.psn_igdb drop constraint if exists psn_igdb_tipo_check;
alter table public.psn_igdb add constraint psn_igdb_tipo_check check (tipo in ('juego', 'coleccion', 'no_juego'));
alter table public.psn_igdb add column if not exists juegos bigint[];
alter table public.psn_igdb add column if not exists confianza smallint;
alter table public.psn_igdb add column if not exists propuesta_id bigint;

-- -----------------------------------------------------------------------------
-- biblioteca
--   por_revisar: sale en "Revisa tu biblioteca" (títulos nuevos o dudosos).
--   oculto_usuario: lo que decidió el usuario (null = nadie ha decidido; entonces
--   "oculto" lo pone la sincronización, p. ej. para apps y demos).
--   primera_vez: cuándo lo jugó por primera vez (para no emparejar con juegos
--   que aún no habían salido).
-- -----------------------------------------------------------------------------
alter table public.biblioteca add column if not exists por_revisar boolean not null default false;
alter table public.biblioteca add column if not exists oculto_usuario boolean;
alter table public.biblioteca add column if not exists primera_vez timestamptz;
-- Lo que ya estaba oculto lo ocultó el usuario a mano (migración 005).
update public.biblioteca set oculto_usuario = true where oculto and oculto_usuario is null;
grant update (oculto, oculto_usuario, por_revisar) on public.biblioteca to anon, authenticated;

-- -----------------------------------------------------------------------------
-- juegos_alias: versiones fusionadas del mismo juego (vale para todo el grupo).
-- En la ficha, los rankings y la nota del grupo, alias_id cuenta como principal_id.
-- -----------------------------------------------------------------------------
create table if not exists public.juegos_alias (
  alias_id      bigint primary key references public.juegos(igdb_id) on delete cascade,
  principal_id  bigint not null references public.juegos(igdb_id) on delete cascade,
  creado_por    uuid references public.usuarios(id) on delete set null,
  creado_en     timestamptz not null default now(),
  check (alias_id <> principal_id)
);

-- "No, son distintos": no se vuelve a preguntar por esa pareja (por usuario).
create table if not exists public.fusiones_rechazadas (
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  juego_a     bigint not null,
  juego_b     bigint not null,
  creado_en   timestamptz not null default now(),
  primary key (usuario_id, juego_a, juego_b)
);

-- Sagas (colecciones de IGDB) agrupadas o no en la biblioteca de cada usuario.
-- agrupada = false: "No, son juegos distintos" (no se vuelve a sugerir).
create table if not exists public.sagas_usuario (
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  coleccion_id  bigint not null,
  nombre        text,
  agrupada      boolean not null,
  creado_en     timestamptz not null default now(),
  primary key (usuario_id, coleccion_id)
);

-- Mismo modelo que el resto de tablas del grupo: la clave pública lee y escribe.
do $$
declare t text;
begin
  foreach t in array array['juegos_alias', 'fusiones_rechazadas', 'sagas_usuario'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "publico_leer" on public.%I', t);
    execute format('drop policy if exists "publico_crear" on public.%I', t);
    execute format('drop policy if exists "publico_editar" on public.%I', t);
    execute format('drop policy if exists "publico_borrar" on public.%I', t);
    execute format('create policy "publico_leer" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "publico_crear" on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "publico_editar" on public.%I for update to anon, authenticated using (true) with check (true)', t);
    execute format('create policy "publico_borrar" on public.%I for delete to anon, authenticated using (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;
