-- =============================================================================
-- CVJ · "Rejugado": una marca sí/no por usuario y juego, sin contador de vueltas
--
--  · valoraciones.rejugado: lo ha vuelto a jugar alguna vez. Se activa al elegir
--    "Rejugando" (o a mano en Valorar) y se puede quitar. "Rejugando" (rejugando = true,
--    estado completado) sigue existiendo mientras lo juega; al completarlo vuelve a
--    "Completado" con la marca.
--  · Fuera el contador: valoraciones.vueltas y actividad.vuelta ("Completado ×2", "por 4.ª
--    vez"). Lo que había pasa a la marca (vueltas > 1 o rejugando → rejugado) y, en la
--    actividad, a actividad.rejugado ("lo ha vuelto a completar").
-- =============================================================================

alter table public.valoraciones add column if not exists rejugado boolean not null default false;
alter table public.actividad add column if not exists rejugado boolean not null default false;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'valoraciones' and column_name = 'vueltas') then
    update public.valoraciones set rejugado = true where (vueltas > 1 or rejugando) and not rejugado;
    alter table public.valoraciones drop column vueltas;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'actividad' and column_name = 'vuelta') then
    update public.actividad set rejugado = true where vuelta > 1 and not rejugado;
    alter table public.actividad drop column vuelta;
  end if;
end $$;
update public.valoraciones set rejugado = true where rejugando and not rejugado;

-- Aviso de "ha completado": con la marca en vez de la vuelta.
create or replace function public.aviso_completo() returns trigger language plpgsql security definer set search_path = public as $$
declare
  canon bigint := coalesce((select principal_id from juegos_alias where alias_id = new.juego_id), new.juego_id);
  u record;
  jugado boolean;
  vid uuid;
begin
  if new.tipo <> 'completo' then return new; end if;
  select id into vid from valoraciones where usuario_id = new.usuario_id and juego_id = new.juego_id limit 1;
  for u in select id from usuarios where activo and id <> new.usuario_id loop
    jugado := exists (select 1 from valoraciones v where v.usuario_id = u.id and v.estado <> 'pendiente'
      and coalesce((select principal_id from juegos_alias where alias_id = v.juego_id), v.juego_id) = canon);
    if new.celebrar or jugado then
      perform notificar(u.id, 'completo', 'grupo', 'completo:' || new.usuario_id || ':' || canon, new.usuario_id,
        jsonb_build_object('juego_id', new.juego_id, 'coleccion_id', new.coleccion_id, 'tambien', jugado, 'rejugado', new.rejugado,
          'destacar', case when vid is null then null else format('[data-social="valoracion:%s"]', vid) end),
        case when new.coleccion_id is not null then '#coleccion/' || new.coleccion_id else '#juego/' || new.juego_id end,
        case when jugado then 55 else 45 end, true);
    end if;
  end loop;
  return new;
end $$;
