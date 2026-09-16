create table if not exists position_transactions (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references stock_positions(id) on delete cascade,
  transaction_date date not null,
  shares numeric not null, -- positive = achat, negative = vente
  price_per_share numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists position_transactions_position_id_idx on position_transactions(position_id);

alter table position_transactions enable row level security;

create policy "service role full access position_transactions" on position_transactions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Seed one transaction per position that already has shares + PRU manually set,
-- so nothing already entered today is lost when switching to transaction-based tracking.
insert into position_transactions (position_id, transaction_date, shares, price_per_share)
select id, coalesce(purchase_date, created_at::date), shares, cost_basis
from stock_positions
where shares is not null and cost_basis is not null;
