alter table stock_positions add column if not exists cost_basis numeric;
alter table stock_positions add column if not exists purchase_date date;
