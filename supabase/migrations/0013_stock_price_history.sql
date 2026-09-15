create table if not exists stock_price_history (
  ticker text not null,
  trade_date date not null,
  price numeric not null,
  created_at timestamptz not null default now(),
  primary key (ticker, trade_date)
);

alter table stock_price_history enable row level security;

create policy "service role full access stock_price_history" on stock_price_history
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
