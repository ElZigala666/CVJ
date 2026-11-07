-- =============================================================================
-- CVJ · Regla de fusiones automáticas más prudente
--
-- Gran Turismo 5 se fusionó con Gran Turismo 5 Prologue porque IGDB marca GT5
-- como "juego ampliado" del prólogo. Ahora un juego ampliado (tipo 10) solo se
-- fusiona solo si su original NO es un prólogo, demo, episodio o versión reducida
-- (por el nombre o el tipo de IGDB). Ante la duda, no se fusiona: queda la
-- tarjeta "¿Es el mismo juego?" en la ficha.
-- Se deshacen las fusiones automáticas que la regla nueva ya no haría (solo GT5);
-- las creadas o separadas a mano no se tocan.
-- =============================================================================

create or replace function public.version_reducida(nombre text, r jsonb)
returns boolean language sql immutable as $$
  select coalesce(nullif(r->>'tipo', '')::int, 0) in (1, 2, 4, 6, 7, 13)
      or coalesce(nombre, '') ~* '(prologue|pr[oó]logo|\mdemo\M|episode|episodio|chapter|cap[ií]tulo|\mlite\M|\mtrial\M|prelude|preludio|ground zeroes|first look|vertical slice|\mbeta\M)'
$$;

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
    join juegos jv on jv.igdb_id = p.alias_id
   where p.alias_id <> p.padre
     -- Juego ampliado (tipo 10): solo si el original no es un prólogo, demo, episodio...
     and not (coalesce(nullif(jv.relaciones->>'tipo', '')::int, 0) = 10 and public.version_reducida(jp.nombre, jp.relaciones))
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

-- Las automáticas que la regla nueva no haría, fuera (vuelven a contar aparte).
delete from public.juegos_alias a
 using public.juegos jv, public.juegos jp
 where a.auto and jv.igdb_id = a.alias_id and jp.igdb_id = a.principal_id
   and coalesce(nullif(jv.relaciones->>'tipo', '')::int, 0) = 10
   and public.version_reducida(jp.nombre, jp.relaciones);
