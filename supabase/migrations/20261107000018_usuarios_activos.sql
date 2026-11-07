-- =============================================================================
-- CVJ · Gestionar el grupo desde la app (solo admin)
--  · usuarios.activo: desactivar a alguien (no puede entrar ni sale en listas, pero
--    sus valoraciones siguen contando). Se puede reactivar.
--  · Altas, códigos nuevos, editar y desactivar los hace la función "admin" con el
--    rol de servicio, comprobando que quien llama es admin. Solo se guarda el hash
--    del código (SHA-256 del código normalizado, igual que el login).
-- =============================================================================
alter table public.usuarios add column if not exists activo boolean not null default true;
