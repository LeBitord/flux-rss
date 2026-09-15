alter table feeds add column if not exists consecutive_errors int not null default 0;
alter table feeds add column if not exists last_success_at timestamptz;
alter table feeds add column if not exists last_new_item_at timestamptz;
alter table feeds add column if not exists last_health_alert_at timestamptz;
