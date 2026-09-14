create table if not exists stock_alerts_sent (
  ticker text not null,
  alert_date date not null,
  direction text not null check (direction in ('up', 'down')),
  created_at timestamptz not null default now(),
  primary key (ticker, alert_date, direction)
);
