-- =============================================================================
-- CVJ · Actividad de colecciones
-- Valorar una colección cuenta en la actividad como UNA entrada ("Marcos valoró la
-- colección FIFA"), no una por cada uno de sus juegos: la fila apunta a la colección
-- (coleccion_id) y no a un juego.
-- =============================================================================
alter table public.actividad alter column juego_id drop not null;
alter table public.actividad add column if not exists coleccion_id uuid references public.colecciones(id) on delete cascade;
alter table public.actividad drop constraint if exists actividad_juego_o_coleccion;
alter table public.actividad add constraint actividad_juego_o_coleccion check (juego_id is not null or coleccion_id is not null);
create index if not exists actividad_coleccion_idx on public.actividad (coleccion_id) where coleccion_id is not null;
