-- Stock/ETF tickers no longer piggyback on a feed (which requires a real RSS URL) —
-- they get their own table, attached directly to a category.
create table if not exists stock_positions (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  label text not null,
  category_id uuid not null references categories(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists stock_positions_category_id_idx on stock_positions(category_id);

alter table stock_positions enable row level security;

create policy "service role full access stock_positions" on stock_positions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

insert into stock_positions (ticker, label, category_id)
select stock_ticker, name, category_id
from feeds
where stock_ticker is not null
on conflict (ticker) do nothing;

alter table feeds drop column if exists stock_ticker;
