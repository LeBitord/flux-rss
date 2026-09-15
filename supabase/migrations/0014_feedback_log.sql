create table if not exists feedback_log (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  direction text not null check (direction in ('up', 'down')),
  topics text not null,
  created_at timestamptz not null default now()
);

create index if not exists feedback_log_category_id_idx on feedback_log(category_id);

alter table feedback_log enable row level security;

create policy "service role full access feedback_log" on feedback_log
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

alter table categories add column if not exists last_relevance_suggestion_at timestamptz;
