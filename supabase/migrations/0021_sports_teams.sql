create table if not exists sports_teams (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  thesportsdb_id text not null,
  name text not null, -- must match TheSportsDB's strTeam (used to tell home from away)
  emoji text not null default '🏅',
  last_notified_event_id text, -- last result posted by /api/sports-results
  created_at timestamptz not null default now(),
  unique (category_id, thesportsdb_id)
);

create index if not exists sports_teams_category_id_idx on sports_teams(category_id);

alter table sports_teams enable row level security;

create policy "service role full access sports_teams" on sports_teams
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- The two teams previously hardcoded in /api/sports-recap.
insert into sports_teams (category_id, thesportsdb_id, name, emoji)
select id, '135332', 'ASM Clermont Auvergne', '🏉' from categories where lower(name) = 'rugby'
on conflict do nothing;

insert into sports_teams (category_id, thesportsdb_id, name, emoji)
select id, '137293', 'Chorale Roanne Basket', '🏀' from categories where lower(name) = 'basket'
on conflict do nothing;
