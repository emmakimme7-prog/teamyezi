create table if not exists public.site_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_state enable row level security;

create policy "public read site_state"
on public.site_state
for select
to anon
using (true);

create policy "public write site_state"
on public.site_state
for all
to anon
using (true)
with check (true);

insert into public.site_state (id, payload)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

