-- =============================================================================
-- CVJ · Horas estimadas con el "tiempo para terminar" de IGDB
--
--  · juegos.ttb_*: caché de game_time_to_beats, en horas (historia, historia + extras
--    y completo). La rellena y refresca la función igdb (acción "tiempos").
--  · horas_estimadas: la estimación de un usuario en un juego, aparte de las horas
--    reales y de las extra a mano.
--      auto        la puso el interruptor de Ajustes (se quita sola si llegan horas
--                  reales o se apaga el interruptor). false = la eligió el usuario.
--      descartada  el usuario la borró: el automático no vuelve a ponerla.
--  · usuarios.estimar_horas: "Estimar horas de juegos completados sin registro".
-- =============================================================================
alter table public.juegos add column if not exists ttb_historia numeric(7,1);
alter table public.juegos add column if not exists ttb_extras numeric(7,1);
alter table public.juegos add column if not exists ttb_completo numeric(7,1);
alter table public.juegos add column if not exists ttb_en timestamptz;

alter table public.usuarios add column if not exists estimar_horas boolean not null default false;

create table if not exists public.horas_estimadas (
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  juego_id        bigint not null references public.juegos(igdb_id) on delete cascade,
  horas           numeric(7,1) not null check (horas > 0 and horas <= 99999),
  tipo            text not null check (tipo in ('historia', 'extras', 'completo')),
  auto            boolean not null default false,
  descartada      boolean not null default false,
  actualizado_en  timestamptz not null default now(),
  primary key (usuario_id, juego_id)
);
alter table public.horas_estimadas enable row level security;
drop policy if exists "publico_leer" on public.horas_estimadas;
drop policy if exists "publico_crear" on public.horas_estimadas;
drop policy if exists "publico_editar" on public.horas_estimadas;
drop policy if exists "publico_borrar" on public.horas_estimadas;
create policy "publico_leer" on public.horas_estimadas for select to anon, authenticated using (true);
create policy "publico_crear" on public.horas_estimadas for insert to anon, authenticated with check (true);
create policy "publico_editar" on public.horas_estimadas for update to anon, authenticated using (true) with check (true);
create policy "publico_borrar" on public.horas_estimadas for delete to anon, authenticated using (true);
grant select, insert, update, delete on public.horas_estimadas to anon, authenticated, service_role;

-- Los tiempos se piden poco a poco, en la tarea de cada hora.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cvj-tiempos') then
    perform cron.unschedule('cvj-tiempos');
  end if;
end $$;
select cron.schedule(
  'cvj-tiempos',
  '47 * * * *',
  $$
  select net.http_post(
    url := 'https://pthjktvmiaijhzvsbrnv.supabase.co/functions/v1/igdb',
    body := '{"accion":"tiempos"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
