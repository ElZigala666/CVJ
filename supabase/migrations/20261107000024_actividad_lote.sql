-- Selección múltiple: varios cambios de estado a la vez cuentan en la actividad como
-- UNA entrada ("Marcos completó 5 juegos"). Cada juego sigue teniendo su fila (así
-- quitar una valoración sigue borrando lo suyo) y las del mismo lote comparten "lote".
alter table public.actividad add column if not exists lote uuid;
create index if not exists actividad_lote_idx on public.actividad (lote) where lote is not null;
