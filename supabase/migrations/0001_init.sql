create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  discord_webhook_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists feeds (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  url text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists seen_items (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references feeds(id) on delete cascade,
  guid text not null,
  published_at timestamptz,
  seen_at timestamptz not null default now(),
  unique (feed_id, guid)
);

create index if not exists feeds_category_id_idx on feeds(category_id);
create index if not exists seen_items_feed_id_idx on seen_items(feed_id);

alter table categories enable row level security;
alter table feeds enable row level security;
alter table seen_items enable row level security;

create policy "service role full access categories" on categories
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "service role full access feeds" on feeds
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "service role full access seen_items" on seen_items
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
