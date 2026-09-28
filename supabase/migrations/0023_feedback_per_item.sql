-- One vote per article: a repeat click is ignored, an opposite click replaces the vote.
-- Nullable because rows logged before this migration have no item, and purged items
-- (seen_items retention) keep their feedback history.
alter table feedback_log
  add column if not exists seen_item_id uuid references seen_items(id) on delete set null;

create unique index if not exists feedback_log_seen_item_id_key
  on feedback_log(seen_item_id) where seen_item_id is not null;
