-- =============================================================================
-- CVJ · Clasificación de los juegos (para las estadísticas): temas, modos de juego,
-- perspectiva del jugador, desarrolladoras y franquicia, de IGDB.
--
--  · juegos.temas / modos / perspectivas: nombres ya traducidos (mapa fijo de la función
--    igdb). La app agrupa los demasiado finos al pintar (js/clasificacion.js).
--  · juegos.desarrolladoras: las principales (involved_companies.developer). La columna
--    desarrolladora (la primera) se queda como estaba.
--  · juegos.franquicia: la franquicia principal (o la primera).
--  · temas = null → aún sin clasificar. Lo rellena la función igdb al guardar un juego y,
--    para los que ya estaban o llegan por otro camino, la acción "clasificar" (en lotes de
--    500, tarea cvj-clasificar cada hora). También vuelve a leer los géneros y el año.
-- =============================================================================

alter table public.juegos add column if not exists temas text[];
alter table public.juegos add column if not exists modos text[];
alter table public.juegos add column if not exists perspectivas text[];
alter table public.juegos add column if not exists desarrolladoras text[];
alter table public.juegos add column if not exists franquicia text;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cvj-clasificar') then
    perform cron.unschedule('cvj-clasificar');
  end if;
end $$;
select cron.schedule(
  'cvj-clasificar',
  '41 * * * *',
  $c$
  select net.http_post(
    url := 'https://pthjktvmiaijhzvsbrnv.supabase.co/functions/v1/igdb',
    body := '{"accion":"clasificar"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $c$
);
