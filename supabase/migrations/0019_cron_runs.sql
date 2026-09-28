create table if not exists cron_runs (
  job text primary key,
  last_run_at timestamptz not null,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz
);

alter table cron_runs enable row level security;

create policy "service role full access cron_runs" on cron_runs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Speeds up the retention purge in /api/poll (delete by published_at).
create index if not exists seen_items_published_at_idx on seen_items(published_at);
