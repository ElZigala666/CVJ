-- =============================================================================
-- CVJ · Rejugar, celebraciones de "completado", portada de un juego con versiones
--       y ediciones ampliadas que ya no se fusionan solas
--
--  · valoraciones.vueltas: veces que lo ha completado (1 al completarlo; "Completado ×2").
--    valoraciones.rejugando: lo completó y ha vuelto a jugarlo. Sigue en Completado (no
--    se pierde) y además sale en "Jugando ahora" como "Rejugando".
--    valoraciones.jugando_desde: desde cuándo está en Jugando (o rejugando).
--  · actividad: tipo 'rejuega' ("ha vuelto a jugar a…"), vuelta (2 = "por 2.ª vez") y
--    celebrar (lo tenía en Jugando de verdad, unos días: los demás ven una celebración).
--  · celebraciones_vistas: quién ha visto ya cada celebración (una sola vez por persona).
--  · juegos.mostrar_como: en un juego con versiones, la versión cuya portada y nombre se
--    enseñan (lo elige el admin). null = los del juego principal.
--  · version_ampliada(): las ediciones ampliadas no se fusionan solas.
-- =============================================================================
alter table public.valoraciones add column if not exists vueltas smallint not null default 0;
alter table public.valoraciones add column if not exists rejugando boolean not null default false;
alter table public.valoraciones add column if not exists jugando_desde timestamptz;
update public.valoraciones set vueltas = 1 where estado = 'completado' and vueltas = 0;
update public.valoraciones set jugando_desde = coalesce(actualizado_en, creado_en) where estado = 'jugando' and jugando_desde is null;

alter table public.actividad drop constraint if exists actividad_tipo_check;
alter table public.actividad add constraint actividad_tipo_check check (tipo in ('valoro', 'empezo', 'completo', 'abandono', 'pendiente', 'rejuega'));
alter table public.actividad add column if not exists vuelta smallint;
alter table public.actividad add column if not exists celebrar boolean not null default false;

create table if not exists public.celebraciones_vistas (
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  actividad_id  uuid not null references public.actividad(id) on delete cascade,
  visto_en      timestamptz not null default now(),
  primary key (usuario_id, actividad_id)
);
alter table public.celebraciones_vistas enable row level security;
drop policy if exists "publico_leer" on public.celebraciones_vistas;
drop policy if exists "publico_crear" on public.celebraciones_vistas;
drop policy if exists "publico_editar" on public.celebraciones_vistas;
drop policy if exists "publico_borrar" on public.celebraciones_vistas;
create policy "publico_leer" on public.celebraciones_vistas for select to anon, authenticated using (true);
create policy "publico_crear" on public.celebraciones_vistas for insert to anon, authenticated with check (true);
create policy "publico_editar" on public.celebraciones_vistas for update to anon, authenticated using (true) with check (true);
create policy "publico_borrar" on public.celebraciones_vistas for delete to anon, authenticated using (true);
grant select, insert, update, delete on public.celebraciones_vistas to anon, authenticated, service_role;

alter table public.juegos add column if not exists mostrar_como bigint;

-- ¿Es una edición ampliada? El tipo "juego ampliado" de IGDB (10) o un nombre de los que
-- suelen serlo. No se fusiona sola con el original.
create or replace function public.version_ampliada(nombre text, r jsonb)
returns boolean language sql immutable as $va$
  select coalesce(nullif(r->>'tipo', '')::int, 0) = 10
      or coalesce(nombre, '') ~* '(full body|\mroyal\M|director.?s cut|final cut|\mintergrade\M|\mgolden\M|\mfes\M|\mportable\M|final mix)'
$va$;

CREATE OR REPLACE FUNCTION public.fusionar_versiones()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fv$
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
    join juegos jv on jv.igdb_id = p.alias_id
   where p.alias_id <> p.padre
     -- Ediciones ampliadas (Royal, Full Body, Director's Cut...): en la práctica pueden ser
     -- otro juego. Ante la duda no se fusionan solas: la app lo sugiere y decide una persona.
     and not public.version_ampliada(jv.nombre, jv.relaciones)
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
end $fv$;

CREATE OR REPLACE FUNCTION public.huellas()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $hu$
  select jsonb_build_object(
    'usuarios', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from usuarios t) x),
    'valoraciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from valoraciones t) x),
    'juegos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'resumen' - 'ttb_en')::text) h from juegos t) x),
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
    'celebraciones_vistas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from celebraciones_vistas t) x)
  );
$hu$;
