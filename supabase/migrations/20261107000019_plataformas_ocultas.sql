-- =============================================================================
-- CVJ · "No uso esta plataforma" (Ajustes → Plataformas): por usuario, se puede deshacer.
-- =============================================================================
alter table public.usuarios add column if not exists plataformas_ocultas text[] not null default '{}';
