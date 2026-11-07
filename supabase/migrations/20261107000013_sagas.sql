-- =============================================================================
-- CVJ · Sagas como juegos
--
--  · sagas: una saga del grupo (FIFA, Uncharted...) con nombre y portada. La edita
--    cualquiera desde su ficha.
--  · sagas_juegos: sus juegos, en orden. Un juego está como mucho en una saga.
--  · valoraciones_saga: valorar la saga (La sigo / La dejé / Pendiente, nota,
--    recomendación, reseña y horas extra propias de la saga).
--  · Las sagas que alguien tenía agrupadas (sagas_usuario.agrupada) pasan a ser
--    sagas del grupo con los juegos de esa colección que tiene alguien.
--    sagas_usuario se queda para las sugerencias rechazadas ("No, son distintos").
-- =============================================================================

create table if not exists public.sagas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (length(trim(nombre)) between 1 and 80),
  cover_id        text,                 -- portada elegida (la de uno de sus juegos)
  coleccion_id    bigint,               -- colección de IGDB de la que salió (si salió de una)
  creado_por      uuid references public.usuarios(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.sagas_juegos (
  juego_id   bigint primary key references public.juegos(igdb_id) on delete cascade,
  saga_id    uuid not null references public.sagas(id) on delete cascade,
  orden      int not null default 0,
  creado_en  timestamptz not null default now()
);
create index if not exists sagas_juegos_saga_idx on public.sagas_juegos (saga_id);

create table if not exists public.valoraciones_saga (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  saga_id         uuid not null references public.sagas(id) on delete cascade,
  estado          text not null check (estado in ('jugando', 'abandonado', 'pendiente')),
  nota            numeric(3,1) check (nota between 0 and 10),
  recomendado     boolean,
  resena          text check (length(resena) <= 280),
  horas_extra     numeric(7,1) check (horas_extra > 0 and horas_extra <= 99999),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (usuario_id, saga_id)
);

-- Lo mismo que el resto de la app: lectura y escritura públicas con la clave publishable.
do $$
declare t text;
begin
  foreach t in array array['sagas', 'sagas_juegos', 'valoraciones_saga'] loop
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

-- -----------------------------------------------------------------------------
-- Fusionar dos sagas (FIFA + EA Sports FC): los juegos de "origen" pasan al final
-- de "destino"; de las valoraciones de cada uno se queda la más reciente.
-- -----------------------------------------------------------------------------
create or replace function public.fusionar_sagas(p_destino uuid, p_origen uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_max int;
begin
  if p_destino = p_origen then return jsonb_build_object('ok', false); end if;
  select coalesce(max(orden), 0) into v_max from sagas_juegos where saga_id = p_destino;
  update sagas_juegos set saga_id = p_destino, orden = v_max + orden + 1 where saga_id = p_origen;
  -- Valoraciones: si alguien tiene en las dos, se queda la más reciente.
  delete from valoraciones_saga o
   using valoraciones_saga d
   where o.saga_id = p_origen and d.saga_id = p_destino and d.usuario_id = o.usuario_id
     and d.actualizado_en >= o.actualizado_en;
  delete from valoraciones_saga d
   using valoraciones_saga o
   where d.saga_id = p_destino and o.saga_id = p_origen and d.usuario_id = o.usuario_id;
  update valoraciones_saga set saga_id = p_destino where saga_id = p_origen;
  update sagas set cover_id = coalesce(cover_id, (select cover_id from sagas where id = p_origen)), actualizado_en = now() where id = p_destino;
  delete from sagas where id = p_origen;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.fusionar_sagas(uuid, uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Lo que había: sagas agrupadas por alguien → sagas del grupo
-- -----------------------------------------------------------------------------
do $$
declare
  r record; v_id uuid;
begin
  for r in
    select coleccion_id, min(creado_en) as creado_en, (array_agg(usuario_id order by creado_en))[1] as usuario_id
      from sagas_usuario where agrupada group by coleccion_id
  loop
    if exists (select 1 from sagas where coleccion_id = r.coleccion_id) then continue; end if;
    -- Juegos principales de esa colección que alguien tiene (valorados o en su biblioteca).
    create temp table if not exists _js (juego_id bigint, anio int, cover_id text, nombre text) on commit drop;
    truncate _js;
    insert into _js
    select distinct j.igdb_id, j.anio, j.cover_id, c.nombre
      from juegos j
      cross join lateral (select x->>'nombre' as nombre from jsonb_array_elements(coalesce(j.relaciones->'colecciones', '[]'::jsonb)) x
                          where (x->>'id')::bigint = r.coleccion_id limit 1) c
     where not exists (select 1 from juegos_alias a where a.alias_id = j.igdb_id)
       and not exists (select 1 from sagas_juegos sj where sj.juego_id = j.igdb_id)
       and (exists (select 1 from valoraciones v left join juegos_alias a on a.alias_id = v.juego_id
                     where coalesce(a.principal_id, v.juego_id) = j.igdb_id)
         or exists (select 1 from biblioteca b left join psn_igdb e on e.psn_title_id = b.psn_title_id
                     left join juegos_alias a on a.alias_id = coalesce(e.igdb_id, b.juego_id)
                     where coalesce(a.principal_id, e.igdb_id, b.juego_id) = j.igdb_id));
    if (select count(*) from _js) < 2 then continue; end if;
    insert into sagas (nombre, cover_id, coleccion_id, creado_por, creado_en)
    values ((select nombre from _js where nombre is not null and nombre <> '' limit 1),
            (select cover_id from _js where cover_id is not null order by anio desc nulls last limit 1),
            r.coleccion_id, r.usuario_id, r.creado_en)
    returning id into v_id;
    insert into sagas_juegos (juego_id, saga_id, orden)
    select juego_id, v_id, row_number() over (order by anio nulls last, juego_id) from _js;
  end loop;
  delete from sagas_usuario where agrupada;
end $$;
