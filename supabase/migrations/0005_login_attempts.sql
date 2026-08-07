create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_attempted_at_idx
  on login_attempts (ip, attempted_at);

alter table login_attempts enable row level security;

create policy "service role full access login_attempts" on login_attempts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
