-- =============================================================================
-- CVJ · Orden manual de la tier list
--
--  · usuarios.tiers_orden: { "j:1942": 0, "c:{uuid}": 1, ... } = la posición de cada juego (o
--    colección) dentro de su rango, en MI tier list (la ven así también los demás). Lo que no
--    tiene posición va detrás, por nota. El rango lo sigue decidiendo la nota.
--  · Columna nueva en usuarios: su permiso de leer y de cambiar (migración 043).
-- =============================================================================

alter table public.usuarios add column if not exists tiers_orden jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_tiers_orden_check') then
    alter table public.usuarios add constraint usuarios_tiers_orden_check check (tiers_orden is null or (jsonb_typeof(tiers_orden) = 'object' and length(tiers_orden::text) <= 60000));
  end if;
end $$;
grant select (tiers_orden) on public.usuarios to anon, authenticated;
grant update (tiers_orden) on public.usuarios to anon, authenticated;
