create table if not exists stock_alerts_sent (
  ticker text not null,
  alert_date date not null,
  direction text not null check (direction in ('up', 'down')),
  created_at timestamptz not null default now(),
  primary key (ticker, alert_date, direction)
);

alter table stock_alerts_sent enable row level security;

create policy "service role full access stock_alerts_sent" on stock_alerts_sent
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
