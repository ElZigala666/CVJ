-- =============================================================================
-- CVJ · Horas que se repiten entre fuentes (p. ej. Steam y Xbox en PC)
--
--  · horas_ajustes: lo que decide cada usuario en cada juego sobre sus horas
--    sincronizadas. Por defecto TODO suma (sin fila = todo cuenta).
--      excluidas   claves de las líneas del desglose que NO cuentan
--                  ("{cuenta_id}|{plataforma original}").
--      plataformas plataforma corregida por línea ({"clave": "PC"}).
--      distintas   "Son partidas distintas": quita el aviso de posible duplicado.
--    La sincronización nunca toca esta tabla: si las horas suben, se actualizan
--    los valores y se sigue respetando qué cuenta.
--  · biblioteca.dispositivos: los dispositivos que da Xbox para el título (son en los
--    que existe el juego, NO en los que se ha jugado). Sirve para el aviso.
-- =============================================================================
create table if not exists public.horas_ajustes (
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  juego_id       bigint not null,
  excluidas      text[] not null default '{}',
  plataformas    jsonb not null default '{}'::jsonb,
  distintas      boolean not null default false,
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, juego_id)
);

alter table public.horas_ajustes enable row level security;
drop policy if exists "publico_leer" on public.horas_ajustes;
drop policy if exists "publico_crear" on public.horas_ajustes;
drop policy if exists "publico_editar" on public.horas_ajustes;
drop policy if exists "publico_borrar" on public.horas_ajustes;
create policy "publico_leer" on public.horas_ajustes for select to anon, authenticated using (true);
create policy "publico_crear" on public.horas_ajustes for insert to anon, authenticated with check (true);
create policy "publico_editar" on public.horas_ajustes for update to anon, authenticated using (true) with check (true);
create policy "publico_borrar" on public.horas_ajustes for delete to anon, authenticated using (true);
grant select, insert, update, delete on public.horas_ajustes to anon, authenticated, service_role;

alter table public.biblioteca add column if not exists dispositivos text[];
