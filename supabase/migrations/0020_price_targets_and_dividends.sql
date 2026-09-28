-- One-shot price alerts: cleared once they fire.
alter table stock_positions add column if not exists target_above numeric;
alter table stock_positions add column if not exists target_below numeric;

create table if not exists position_dividends (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references stock_positions(id) on delete cascade,
  payment_date date not null,
  amount numeric not null check (amount > 0), -- total received, in €
  created_at timestamptz not null default now()
);

create index if not exists position_dividends_position_id_idx on position_dividends(position_id);

alter table position_dividends enable row level security;

create policy "service role full access position_dividends" on position_dividends
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Cache of sum(position_dividends.amount), like shares/cost_basis for transactions.
alter table stock_positions add column if not exists dividends_total numeric not null default 0;
