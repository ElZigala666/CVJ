-- =============================================================================
-- CVJ · Columnas: más herramientas para el autor y el lector
--
--  · entradas.replica_de: la entrada a la que responde (réplica de otro columnista).
--  · entradas.portada: imagen de cabecera de la entrada (subida o arte de IGDB, https).
--  · lecturas.al_final: llegó al final del texto (para las estadísticas del autor).
--  · encuestas_votos: un voto por persona y entrada (la encuesta va en el texto, bloque
--    :::encuesta; opcion = índice 0-3 de la opción). Abierta como el resto de tablas.
--  · Avisos: "@Nombre" en una entrada publicada → aviso a esa persona (una vez por entrada);
--    réplica publicada → aviso al autor de la original.
-- =============================================================================

alter table public.entradas add column if not exists replica_de uuid references public.entradas(id) on delete set null;
alter table public.entradas add column if not exists portada text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entradas_portada_check') then
    alter table public.entradas add constraint entradas_portada_check check (portada is null or (length(portada) <= 500 and portada ~* '^https://'));
  end if;
end $$;
create index if not exists entradas_replica_idx on public.entradas (replica_de) where replica_de is not null;

alter table public.lecturas add column if not exists al_final boolean not null default false;

create table if not exists public.encuestas_votos (
  entrada_id  uuid not null references public.entradas(id) on delete cascade,
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  opcion      smallint not null check (opcion between 0 and 3),
  creado_en   timestamptz not null default now(),
  primary key (entrada_id, usuario_id)
);
alter table public.encuestas_votos enable row level security;
drop policy if exists "publico_leer" on public.encuestas_votos;
drop policy if exists "publico_crear" on public.encuestas_votos;
drop policy if exists "publico_editar" on public.encuestas_votos;
drop policy if exists "publico_borrar" on public.encuestas_votos;
create policy "publico_leer" on public.encuestas_votos for select to anon, authenticated using (true);
create policy "publico_crear" on public.encuestas_votos for insert to anon, authenticated with check (true);
create policy "publico_editar" on public.encuestas_votos for update to anon, authenticated using (true) with check (true);
create policy "publico_borrar" on public.encuestas_votos for delete to anon, authenticated using (true);
grant select, insert, update, delete on public.encuestas_votos to anon, authenticated, service_role;

-- Menciones y réplicas: avisos al publicar (o al cambiar el texto ya publicado).
create or replace function public.aviso_entrada_extra() returns trigger language plpgsql security definer set search_path = public as $$
declare
  u record;
  orig record;
begin
  if new.estado <> 'publicada' then return new; end if;
  for u in select id, nombre from usuarios where activo and id <> new.usuario_id loop
    if new.cuerpo ~* ('(^|[^[:alnum:]_])@' || regexp_replace(u.nombre, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '([^[:alnum:]_]|$)') then
      perform notificar(u.id, 'mencion', 'mi', 'mencion:' || new.id, new.usuario_id,
        jsonb_build_object('entrada_id', new.id), '#entrada/' || new.id, 70, true);
    end if;
  end loop;
  if new.replica_de is not null and (tg_op = 'INSERT' or old.estado is distinct from 'publicada') then
    select id, usuario_id into orig from entradas where id = new.replica_de;
    if orig.id is not null then
      perform notificar(orig.usuario_id, 'replica', 'mi', 'replica:' || new.id, new.usuario_id,
        jsonb_build_object('entrada_id', new.id, 'original_id', orig.id), '#entrada/' || new.id, 72, true);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists avisos_entradas_extra on public.entradas;
create trigger avisos_entradas_extra after insert or update of estado, cuerpo on public.entradas
  for each row execute function public.aviso_entrada_extra();
