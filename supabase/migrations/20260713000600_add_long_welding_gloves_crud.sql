alter table public.long_welding_gloves
  add column if not exists notes text,
  add column if not exists is_archived boolean not null default false;

create index if not exists long_welding_gloves_active_received_date_idx
  on public.long_welding_gloves (received_date desc)
  where is_archived = false;

grant select, insert, update on table public.long_welding_gloves to authenticated;
grant usage, select on sequence public.long_welding_gloves_id_seq to authenticated;
