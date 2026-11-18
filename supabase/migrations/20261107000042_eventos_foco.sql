-- =============================================================================
-- CVJ · Punto de enfoque de la imagen de un evento: el centro del recorte (object-position)
-- en todos los tamaños del banner y de la página. En % (0-100). Por defecto, el centro.
-- =============================================================================
alter table public.eventos add column if not exists foco_x numeric not null default 50 check (foco_x between 0 and 100);
alter table public.eventos add column if not exists foco_y numeric not null default 50 check (foco_y between 0 and 100);
