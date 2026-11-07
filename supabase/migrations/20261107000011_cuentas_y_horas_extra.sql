-- =============================================================================
-- CVJ · Varias cuentas por plataforma y modelo de horas definitivo
--
--  · cuentas_plataforma: cada cuenta vinculada (PSN, Xbox y, en el futuro, Steam),
--    con etiqueta opcional ("Cuenta principal", "Cuenta 2"). Un usuario puede
--    tener varias de la misma plataforma.
--  · psn_cuentas (tokens) y biblioteca pasan a ir por cuenta (cuenta_id).
--  · horas_extra: horas a mano por (usuario, juego) en plataformas o cuentas que no
--    se sincronizan. La sincronización NUNCA las toca.
--  · El campo manual antiguo (valoraciones.horas, que SUSTITUÍA a las sincronizadas)
--    se pasa a horas_extra: sin sincronizadas → todo extra; manual mayor → la
--    diferencia; manual menor o igual → se descarta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cuentas de plataforma
-- -----------------------------------------------------------------------------
create table if not exists public.cuentas_plataforma (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.usuarios(id) on delete cascade,
  fuente           text not null check (fuente in ('psn', 'xbox', 'steam')),
  externo_id       text not null,        -- accountId (PSN), xuid (Xbox), steamid (Steam)
  nombre           text,                 -- ID online (PSN) o gamertag (Xbox)
  etiqueta         text,                 -- "Cuenta principal", "Cuenta 2"...
  sincronizado_en  timestamptz,
  reconectar       boolean not null default false,
  creado_en        timestamptz not null default now(),
  unique (usuario_id, fuente, externo_id)
);
create index if not exists cuentas_plataforma_usuario_idx on public.cuentas_plataforma (usuario_id);

alter table public.cuentas_plataforma enable row level security;
drop policy if exists "publico_leer" on public.cuentas_plataforma;
drop policy if exists "publico_etiqueta" on public.cuentas_plataforma;
create policy "publico_leer" on public.cuentas_plataforma for select to anon, authenticated using (true);
create policy "publico_etiqueta" on public.cuentas_plataforma for update to anon, authenticated using (true) with check (true);
grant select on public.cuentas_plataforma to anon, authenticated;
grant update (etiqueta) on public.cuentas_plataforma to anon, authenticated;
grant select, insert, update, delete on public.cuentas_plataforma to service_role;

-- Las cuentas que ya había (una por usuario y plataforma)
insert into public.cuentas_plataforma (usuario_id, fuente, externo_id, nombre, sincronizado_en, reconectar)
select id, 'psn', psn_account_id, psn_online_id, psn_sincronizado_en, coalesce(psn_reconectar, false)
  from public.usuarios where psn_account_id is not null
on conflict (usuario_id, fuente, externo_id) do nothing;
insert into public.cuentas_plataforma (usuario_id, fuente, externo_id, nombre, sincronizado_en)
select id, 'xbox', xbox_xuid, xbox_gamertag, xbox_sincronizado_en
  from public.usuarios where xbox_xuid is not null
on conflict (usuario_id, fuente, externo_id) do nothing;

-- -----------------------------------------------------------------------------
-- psn_cuentas (tokens): una fila por cuenta, no por usuario
-- -----------------------------------------------------------------------------
alter table public.psn_cuentas add column if not exists cuenta_id uuid references public.cuentas_plataforma(id) on delete cascade;
update public.psn_cuentas t
   set cuenta_id = c.id
  from public.cuentas_plataforma c
 where t.cuenta_id is null and c.fuente = 'psn' and c.usuario_id = t.usuario_id and c.externo_id = t.account_id;
-- Tokens sin cuenta (no debería haber): fuera, habría que volver a conectar.
delete from public.psn_cuentas where cuenta_id is null;
alter table public.psn_cuentas drop constraint if exists psn_cuentas_pkey;
alter table public.psn_cuentas alter column cuenta_id set not null;
alter table public.psn_cuentas add primary key (cuenta_id);
create index if not exists psn_cuentas_usuario_idx on public.psn_cuentas (usuario_id);

-- -----------------------------------------------------------------------------
-- biblioteca: por cuenta
-- -----------------------------------------------------------------------------
alter table public.biblioteca add column if not exists cuenta_id uuid references public.cuentas_plataforma(id) on delete cascade;
update public.biblioteca b
   set cuenta_id = c.id
  from public.cuentas_plataforma c
 where b.cuenta_id is null and c.usuario_id = b.usuario_id and c.fuente = b.fuente;
alter table public.biblioteca drop constraint if exists biblioteca_usuario_id_psn_title_id_key;
alter table public.biblioteca drop constraint if exists biblioteca_cuenta_titulo_key;
alter table public.biblioteca add constraint biblioteca_cuenta_titulo_key unique (cuenta_id, psn_title_id);
create index if not exists biblioteca_cuenta_idx on public.biblioteca (cuenta_id);

-- -----------------------------------------------------------------------------
-- Horas extra a mano
-- -----------------------------------------------------------------------------
create table if not exists public.horas_extra (
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  juego_id        bigint not null references public.juegos(igdb_id) on delete cascade,
  horas           numeric(7,1) not null check (horas > 0 and horas <= 99999),
  actualizado_en  timestamptz not null default now(),
  primary key (usuario_id, juego_id)
);
alter table public.horas_extra enable row level security;
drop policy if exists "publico_leer" on public.horas_extra;
drop policy if exists "publico_crear" on public.horas_extra;
drop policy if exists "publico_editar" on public.horas_extra;
drop policy if exists "publico_borrar" on public.horas_extra;
create policy "publico_leer" on public.horas_extra for select to anon, authenticated using (true);
create policy "publico_crear" on public.horas_extra for insert to anon, authenticated with check (true);
create policy "publico_editar" on public.horas_extra for update to anon, authenticated using (true) with check (true);
create policy "publico_borrar" on public.horas_extra for delete to anon, authenticated using (true);
grant select, insert, update, delete on public.horas_extra to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Pasar el campo manual antiguo a horas extra
-- -----------------------------------------------------------------------------
do $$
declare
  n_sin int := 0; n_diferencia int := 0; n_descartado int := 0;
begin
  create temp table _migrar_horas on commit drop as
  with canon as (
    -- juego principal (versiones fusionadas)
    select j.igdb_id, coalesce(a.principal_id, j.igdb_id) as principal
      from public.juegos j left join public.juegos_alias a on a.alias_id = j.igdb_id
  ),
  sinc as (
    -- horas sincronizadas por usuario y juego principal, sin contar dos veces el mismo dato
    select d.usuario_id, d.principal, sum(d.horas) as horas
      from (
        select distinct b.usuario_id, c.principal, b.fuente, b.horas, b.ultima_vez
          from public.biblioteca b
          left join public.psn_igdb e on e.psn_title_id = b.psn_title_id
          join canon c on c.igdb_id = case when e.psn_title_id is not null and e.tipo in ('coleccion', 'no_juego') then null
                                           else coalesce(e.igdb_id, b.juego_id) end
         where not b.oculto and b.horas is not null
      ) d
     group by d.usuario_id, d.principal
  )
  select v.id, v.usuario_id, coalesce(c.principal, v.juego_id) as juego_id, v.horas as manual, coalesce(s.horas, 0) as sincronizadas
    from public.valoraciones v
    left join canon c on c.igdb_id = v.juego_id
    left join sinc s on s.usuario_id = v.usuario_id and s.principal = coalesce(c.principal, v.juego_id)
   where v.horas is not null and v.horas > 0;

  select count(*) filter (where sincronizadas = 0),
         count(*) filter (where sincronizadas > 0 and manual > sincronizadas),
         count(*) filter (where sincronizadas > 0 and manual <= sincronizadas)
    into n_sin, n_diferencia, n_descartado
    from _migrar_horas;

  insert into public.horas_extra (usuario_id, juego_id, horas)
  select usuario_id, juego_id, round((manual - sincronizadas)::numeric, 1)
    from _migrar_horas
   where manual - sincronizadas >= 0.1
  on conflict (usuario_id, juego_id) do update set horas = excluded.horas, actualizado_en = now();

  update public.valoraciones set horas = null where id in (select id from _migrar_horas);

  raise notice 'Horas manuales migradas: % sin sincronizadas (todo extra), % con diferencia a extra, % descartadas',
    n_sin, n_diferencia, n_descartado;
end $$;

-- -----------------------------------------------------------------------------
-- Tarea de cada hora: además de horas y emparejamientos, vuelve a sincronizar las
-- cuentas de PSN con más de 12 h (las de Xbox, con más de 6 h, las hace la propia
-- tarea de xbox) para que las horas se actualicen solas al jugar.
-- -----------------------------------------------------------------------------
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
    url := 'https://pthjktvmiaijhzvsbrnv.supabase.co/functions/v1/psn',
    body := '{"accion":"reprocesar_todos"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
