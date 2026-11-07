-- =============================================================================
-- CVJ · Migración 009 · Horas de Xbox, PC detectado, "Probados" y tarea horaria
-- Pégala entera en Supabase → SQL Editor → New query → Run.
-- Necesita de la 003 a la 008 (ya ejecutadas). Se puede ejecutar más de una vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- biblioteca
--   horas_en:      cuándo se pidieron las horas de Xbox por última vez
--   detectado:     juego de PC que Xbox detectó pero no es de la tienda (Steam, Epic...)
--   en_mis_juegos: true = subido a "Mis juegos" a mano; false = mandado a "Probados";
--                  null = lo decide el umbral
-- -----------------------------------------------------------------------------
alter table public.biblioteca add column if not exists horas_en timestamptz;
alter table public.biblioteca add column if not exists detectado boolean not null default false;
alter table public.biblioteca add column if not exists en_mis_juegos boolean;
grant update (oculto, oculto_usuario, por_revisar, en_mis_juegos) on public.biblioteca to anon, authenticated;

-- -----------------------------------------------------------------------------
-- usuarios
--   umbral_probados: horas por debajo de las cuales un juego va a "Probados"
--                    (1, 2 o 5; 0 = nunca)
--   xbox_incluir_pc: incluir los juegos de PC detectados (por defecto, no)
-- -----------------------------------------------------------------------------
alter table public.usuarios add column if not exists umbral_probados smallint not null default 1;
alter table public.usuarios add column if not exists xbox_incluir_pc boolean not null default false;

-- -----------------------------------------------------------------------------
-- Contador de peticiones a OpenXBL por hora (la clave es de todo el grupo).
-- openxbl_reservar(n, maximo): suma n si no se pasa de maximo; devuelve si se pudo.
-- -----------------------------------------------------------------------------
create table if not exists public.openxbl_uso (
  hora        timestamptz primary key,
  peticiones  int not null default 0
);
alter table public.openxbl_uso enable row level security;
drop policy if exists "publico_leer" on public.openxbl_uso;
create policy "publico_leer" on public.openxbl_uso for select to anon, authenticated using (true);
grant select on public.openxbl_uso to anon, authenticated;
grant select, insert, update, delete on public.openxbl_uso to service_role;

create or replace function public.openxbl_reservar(n int, maximo int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  h timestamptz := date_trunc('hour', now());
  hecho int;
begin
  insert into public.openxbl_uso (hora, peticiones) values (h, 0) on conflict (hora) do nothing;
  update public.openxbl_uso set peticiones = peticiones + n
    where hora = h and peticiones + n <= maximo
    returning peticiones into hecho;
  delete from public.openxbl_uso where hora < now() - interval '2 days';
  return hecho is not null;
end $$;
revoke all on function public.openxbl_reservar(int, int) from public, anon, authenticated;
grant execute on function public.openxbl_reservar(int, int) to service_role;

-- -----------------------------------------------------------------------------
-- Tarea de cada hora (pg_cron + pg_net): horas de Xbox y emparejamientos pendientes.
-- Las funciones van sin verificación JWT, así que basta con llamarlas.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

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
    body := '{"accion":"reprocesar_todos"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
