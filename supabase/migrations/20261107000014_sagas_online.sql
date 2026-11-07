-- =============================================================================
-- CVJ · Sagas online / sin final (FIFA, NBA 2K...): como un juego online, no se
-- "juegan" en el historial ni cuentan en la tier list ni en los rankings de nota.
-- Lo decide el admin desde la ficha de la saga.
-- =============================================================================
alter table public.sagas add column if not exists es_online boolean not null default false;
