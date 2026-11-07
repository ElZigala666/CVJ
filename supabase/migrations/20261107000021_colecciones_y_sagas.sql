-- =============================================================================
-- CVJ · Colecciones y sagas: dos conceptos distintos
--
--  · Lo que hasta ahora se llamaba "saga" (FIFA / EA Sports FC: juegos que cuentan
--    como uno solo, con nota, horas y tarjeta única) pasa a llamarse COLECCIÓN.
--    Solo el admin las crea y edita. Se renombran tablas, columnas y la función,
--    sin perder nada.
--      sagas               → colecciones   (coleccion_id de IGDB → igdb_coleccion_id)
--      sagas_juegos        → colecciones_juegos   (saga_id → coleccion_id)
--      valoraciones_saga   → valoraciones_coleccion (saga_id → coleccion_id)
--      fusionar_sagas()    → fusionar_colecciones()
--  · SAGA nueva: juegos independientes que se ven juntos (Persona, Zelda...). Se
--    generan solas desde las colecciones de IGDB (función igdb, "generar_sagas") con
--    todos sus juegos principales, jugados o no. Cada juego sigue con su nota y sus
--    horas: la saga no se valora. El admin puede renombrar, ocultar, fusionar y
--    quitar o añadir juegos.
-- =============================================================================

-- ---------------------------------------------------------------- colecciones
alter table if exists public.sagas rename column coleccion_id to igdb_coleccion_id;
alter table if exists public.sagas rename to colecciones;
alter table if exists public.sagas_juegos rename column saga_id to coleccion_id;
alter table if exists public.sagas_juegos rename to colecciones_juegos;
alter table if exists public.valoraciones_saga rename column saga_id to coleccion_id;
alter table if exists public.valoraciones_saga rename to valoraciones_coleccion;
alter index if exists public.sagas_juegos_saga_idx rename to colecciones_juegos_coleccion_idx;

drop function if exists public.fusionar_sagas(uuid, uuid);
create or replace function public.fusionar_colecciones(p_destino uuid, p_origen uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_max int;
begin
  if p_destino = p_origen then return jsonb_build_object('ok', false); end if;
  select coalesce(max(orden), 0) into v_max from colecciones_juegos where coleccion_id = p_destino;
  update colecciones_juegos set coleccion_id = p_destino, orden = v_max + orden + 1 where coleccion_id = p_origen;
  -- Valoraciones: si alguien tiene en las dos, se queda la más reciente.
  delete from valoraciones_coleccion o
   using valoraciones_coleccion d
   where o.coleccion_id = p_origen and d.coleccion_id = p_destino and d.usuario_id = o.usuario_id
     and d.actualizado_en >= o.actualizado_en;
  delete from valoraciones_coleccion d
   using valoraciones_coleccion o
   where d.coleccion_id = p_destino and o.coleccion_id = p_origen and d.usuario_id = o.usuario_id;
  update valoraciones_coleccion set coleccion_id = p_destino where coleccion_id = p_origen;
  update colecciones set cover_id = coalesce(cover_id, (select cover_id from colecciones where id = p_origen)), actualizado_en = now() where id = p_destino;
  delete from colecciones where id = p_origen;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.fusionar_colecciones(uuid, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- sagas nuevas
create table if not exists public.sagas (
  id                  uuid primary key default gen_random_uuid(),
  igdb_coleccion_id   bigint unique,          -- de qué colección de IGDB sale (null: creada a mano)
  nombre              text not null check (length(trim(nombre)) between 1 and 80),
  nombre_manual       boolean not null default false, -- el admin la renombró: IGDB ya no lo cambia
  oculta              boolean not null default false,
  fusionada_en        uuid references public.sagas(id) on delete set null, -- fusionada con otra
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create table if not exists public.sagas_juegos (
  saga_id    uuid not null references public.sagas(id) on delete cascade,
  juego_id   bigint not null references public.juegos(igdb_id) on delete cascade,
  manual     boolean not null default false,  -- lo añadió el admin
  excluido   boolean not null default false,  -- el admin lo quitó: IGDB no lo vuelve a poner
  creado_en  timestamptz not null default now(),
  primary key (saga_id, juego_id)
);
create index if not exists sagas_juegos_juego_idx on public.sagas_juegos (juego_id);

do $$
declare t text;
begin
  foreach t in array array['sagas', 'sagas_juegos'] loop
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

-- Las sagas se generan (y se ponen al día) en la tarea de cada hora.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cvj-sagas') then
    perform cron.unschedule('cvj-sagas');
  end if;
end $$;
select cron.schedule(
  'cvj-sagas',
  '41 * * * *',
  $$
  select net.http_post(
    url := 'https://pthjktvmiaijhzvsbrnv.supabase.co/functions/v1/igdb',
    body := '{"accion":"generar_sagas"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
