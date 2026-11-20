-- =============================================================================
-- CVJ · Preferencias de la cuenta (pequeñas, de interfaz)
--
--  · usuarios.preferencias: { tiers: 'compacta' | 'completa', ... }. Sin el dato, lo de
--    cada dispositivo (tier list compacta en el móvil y completa en escritorio).
--  · Columna nueva en usuarios: su permiso de leer y de cambiar (migración 043).
-- =============================================================================

alter table public.usuarios add column if not exists preferencias jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_preferencias_check') then
    alter table public.usuarios add constraint usuarios_preferencias_check check (preferencias is null or (jsonb_typeof(preferencias) = 'object' and length(preferencias::text) <= 1000));
  end if;
end $$;
grant select (preferencias) on public.usuarios to anon, authenticated;
grant update (preferencias) on public.usuarios to anon, authenticated;
