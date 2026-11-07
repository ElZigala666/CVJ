-- =============================================================================
-- CVJ · Versiones del mismo juego = el mismo juego (para todo el grupo)
--
--  · Ediciones, ports, remasters y versiones ampliadas según IGDB se fusionan solas
--    en el juego original (juegos_alias con auto = true). Los remakes, no.
--  · versiones_separadas: lo que el admin ha separado no se vuelve a fusionar solo.
--  · Si alguien tenía valoración en dos versiones del mismo juego, se queda la más
--    reciente y se le deja un aviso (tabla avisos) para que la revise.
--  · Las valoraciones se quedan en la versión que cada uno jugó (la app la enseña
--    como etiqueta en "El grupo"); cuentan en el juego principal.
-- =============================================================================

alter table public.juegos_alias add column if not exists auto boolean not null default false;

create table if not exists public.versiones_separadas (
  alias_id      bigint not null,
  principal_id  bigint not null,
  separado_por  uuid references public.usuarios(id) on delete set null,
  creado_en     timestamptz not null default now(),
  primary key (alias_id, principal_id)
);
alter table public.versiones_separadas enable row level security;
drop policy if exists "publico_leer" on public.versiones_separadas;
create policy "publico_leer" on public.versiones_separadas for select to anon, authenticated using (true);
grant select on public.versiones_separadas to anon, authenticated;
grant select, insert, update, delete on public.versiones_separadas to service_role;

create table if not exists public.avisos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  tipo        text not null,
  juego_id    bigint,
  texto       text not null,
  leido       boolean not null default false,
  creado_en   timestamptz not null default now()
);
create index if not exists avisos_usuario_idx on public.avisos (usuario_id);
alter table public.avisos enable row level security;
drop policy if exists "publico_leer" on public.avisos;
drop policy if exists "publico_leido" on public.avisos;
create policy "publico_leer" on public.avisos for select to anon, authenticated using (true);
create policy "publico_leido" on public.avisos for update to anon, authenticated using (true) with check (true);
grant select on public.avisos to anon, authenticated;
grant update (leido) on public.avisos to anon, authenticated;
grant select, insert, update, delete on public.avisos to service_role;

-- -----------------------------------------------------------------------------
-- Juego "padre" de una versión según sus relaciones de IGDB (null si no es versión).
-- Tipos de IGDB: 0 principal, 8 remake, 9 remaster, 10 versión ampliada, 11 port.
-- -----------------------------------------------------------------------------
create or replace function public.padre_version(r jsonb)
returns bigint language sql immutable as $$
  select case
    when r is null then null
    when nullif(r->>'tipo', '')::int in (9, 10, 11)
      then coalesce(nullif(r->>'version_parent', '')::bigint, nullif(r->>'parent_game', '')::bigint)
    when coalesce(nullif(r->>'tipo', '')::int, 0) = 0
      then nullif(r->>'version_parent', '')::bigint
    else null
  end
$$;

-- -----------------------------------------------------------------------------
-- Fusiona todas las versiones conocidas. Idempotente: se puede llamar siempre.
-- -----------------------------------------------------------------------------
create or replace function public.fusionar_versiones()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_nuevas int := 0; n_dup int := 0; n int; vueltas int := 0;
begin
  -- Parejas (versión → padre): desde la propia versión y desde las listas del padre.
  create temp table if not exists _pares (alias_id bigint, padre bigint) on commit drop;
  truncate _pares;
  insert into _pares
  select j.igdb_id, public.padre_version(j.relaciones) from juegos j where public.padre_version(j.relaciones) is not null
  union
  select x.v::bigint, p.igdb_id
    from juegos p
    cross join lateral jsonb_array_elements_text(coalesce(p.relaciones->'remasters', '[]'::jsonb) || coalesce(p.relaciones->'ports', '[]'::jsonb)) x(v)
    join juegos c on c.igdb_id = x.v::bigint
   where coalesce(nullif(c.relaciones->>'tipo', '')::int, 9) not in (8, 1, 2, 4);

  -- Nuevas: los dos juegos guardados, la versión aún sin fusionar y la pareja no separada.
  insert into juegos_alias (alias_id, principal_id, creado_por, creado_en, auto)
  select distinct on (p.alias_id) p.alias_id, coalesce(a.principal_id, p.padre), null, now(), true
    from _pares p
    join juegos jp on jp.igdb_id = p.padre
    left join juegos_alias a on a.alias_id = p.padre
   where p.alias_id <> p.padre
     and coalesce(a.principal_id, p.padre) <> p.alias_id
     and not exists (select 1 from juegos_alias x where x.alias_id = p.alias_id)
     and not exists (select 1 from versiones_separadas s where s.alias_id = p.alias_id and s.principal_id in (p.padre, coalesce(a.principal_id, p.padre)))
   order by p.alias_id, p.padre
  on conflict (alias_id) do nothing;
  get diagnostics n_nuevas = row_count;

  -- Cadenas (A → B → C): todo apunta al de arriba del todo.
  loop
    update juegos_alias x set principal_id = y.principal_id
      from juegos_alias y
     where x.principal_id = y.alias_id and y.principal_id <> x.alias_id;
    get diagnostics n = row_count;
    vueltas := vueltas + 1;
    exit when n = 0 or vueltas > 6;
  end loop;

  -- Valoración en dos versiones del mismo juego: se queda la más reciente y se avisa.
  with canon as (
    select v.id, v.usuario_id, v.juego_id, v.actualizado_en, coalesce(a.principal_id, v.juego_id) as principal
      from valoraciones v left join juegos_alias a on a.alias_id = v.juego_id
  ), orden as (
    select c.*, row_number() over (partition by c.usuario_id, c.principal order by c.actualizado_en desc nulls last, c.id) as n,
           count(*) over (partition by c.usuario_id, c.principal) as total
      from canon c
  ), avisar as (
    insert into avisos (usuario_id, tipo, juego_id, texto)
    select o.usuario_id, 'version_duplicada', o.principal,
           'Tenías valoración en dos versiones de «' || coalesce(jp.nombre, 'un juego') || '». Ahora cuentan como un solo juego y se ha quedado la más reciente («' || coalesce(jv.nombre, '') || '»). Revísala por si quieres cambiar algo.'
      from orden o
      left join juegos jp on jp.igdb_id = o.principal
      left join juegos jv on jv.igdb_id = o.juego_id
     where o.n = 1 and o.total > 1
       and not exists (select 1 from avisos x where x.usuario_id = o.usuario_id and x.tipo = 'version_duplicada' and x.juego_id = o.principal and not x.leido)
    returning 1
  )
  delete from valoraciones v using orden o where v.id = o.id and o.n > 1;
  get diagnostics n_dup = row_count;

  return jsonb_build_object('fusionadas', n_nuevas, 'valoraciones_quitadas', n_dup);
end $$;
grant execute on function public.fusionar_versiones() to anon, authenticated, service_role;

-- Cada vez que se guardan juegos o cambian sus relaciones.
create or replace function public.tras_cambiar_juegos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fusionar_versiones();
  return null;
end $$;
drop trigger if exists juegos_fusionar_versiones on public.juegos;
create trigger juegos_fusionar_versiones
  after insert or update of relaciones on public.juegos
  for each statement execute function public.tras_cambiar_juegos();

-- -----------------------------------------------------------------------------
-- Separar una versión (solo admin): deja de contar como el principal y no se
-- vuelve a fusionar sola.
-- -----------------------------------------------------------------------------
create or replace function public.separar_version(p_alias bigint, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_principal bigint;
begin
  if not exists (select 1 from usuarios where id = p_usuario and es_admin) then
    raise exception 'Solo el admin puede separar versiones';
  end if;
  delete from juegos_alias where alias_id = p_alias returning principal_id into v_principal;
  if v_principal is null then return jsonb_build_object('ok', false); end if;
  insert into versiones_separadas (alias_id, principal_id, separado_por)
  values (p_alias, v_principal, p_usuario) on conflict do nothing;
  return jsonb_build_object('ok', true, 'principal_id', v_principal);
end $$;
grant execute on function public.separar_version(bigint, uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- "Juego online / sin final" es un dato del juego y lo decide el admin: la app ya
-- no deja cambiarlo a los demás. (No había preferencia por usuario que borrar.)
-- -----------------------------------------------------------------------------

-- Todo lo que ya hay.
select public.fusionar_versiones();
