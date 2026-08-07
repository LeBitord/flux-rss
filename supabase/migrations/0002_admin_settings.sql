create table if not exists admin_settings (
  id smallint primary key default 1,
  password_hash text not null,
  updated_at timestamptz not null default now(),
  constraint admin_settings_singleton check (id = 1)
);

alter table admin_settings enable row level security;

create policy "service role full access admin_settings" on admin_settings
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
