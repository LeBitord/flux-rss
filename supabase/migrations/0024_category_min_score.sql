-- Items scored below this are listed compactly at the bottom of the digest instead of
-- getting a full embed. 4/10 = only what the model judges clearly off-topic.
alter table categories add column if not exists min_score smallint not null default 4
  check (min_score between 1 and 10);
