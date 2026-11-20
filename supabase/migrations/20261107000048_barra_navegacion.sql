-- =============================================================================
-- CVJ · Barra de navegación personalizable (móvil)
--
--  · usuarios.barra: { pestanas: ['buscar', 'rankings', 'perfil'], inicio: 'inicio' }.
--    Inicio y el "+" van siempre; las demás (2 a 4), elegidas y en ese orden. inicio = la
--    pestaña al abrir la app. null = la de siempre. La normaliza la app (js/barra.js).
--  · Columna nueva en usuarios: su permiso de leer y de cambiar (migración 043).
-- =============================================================================

alter table public.usuarios add column if not exists barra jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_barra_check') then
    alter table public.usuarios add constraint usuarios_barra_check check (barra is null or (jsonb_typeof(barra) = 'object' and length(barra::text) <= 500));
  end if;
end $$;
grant select (barra) on public.usuarios to anon, authenticated;
grant update (barra) on public.usuarios to anon, authenticated;
