-- =============================================================================
-- CVJ · Varias plataformas al valorar y Steam en la tarea de cada hora
--
--  · valoraciones.plataformas (lista): "PS5 · PC". Se copia lo que había en
--    valoraciones.plataforma (que se quita en la migración 017, cuando la app ya
--    no la use).
--  · La tarea de cada hora también sincroniza Steam (cuentas con más de 6 h).
-- =============================================================================

alter table public.valoraciones add column if not exists plataformas text[];
update public.valoraciones
   set plataformas = array[plataforma]
 where plataformas is null and plataforma is not null and plataforma <> '';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cvj-tarea-horaria') then
    perform cron.unschedule('cvj-tarea-horaria');
  end if;
end $$;

select cron.schedule(
  'cvj-tarea-horaria',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://pthjktvmiaijhzvsbrnv.supabase.co/functions/v1/xbox',
    body := '{"accion":"tarea_horaria"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  select net.http_post(
    url := 'https://pthjktvmiaijhzvsbrnv.supabase.co/functions/v1/psn',
    body := '{"accion":"tarea_horaria"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  select net.http_post(
    url := 'https://pthjktvmiaijhzvsbrnv.supabase.co/functions/v1/steam',
    body := '{"accion":"tarea_horaria"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  select net.http_post(
    url := 'https://pthjktvmiaijhzvsbrnv.supabase.co/functions/v1/psn',
    body := '{"accion":"reprocesar_todos"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
