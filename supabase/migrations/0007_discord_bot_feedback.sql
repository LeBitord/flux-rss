alter table categories add column if not exists discord_channel_id text;
alter table categories alter column discord_webhook_url drop not null;
alter table feeds add column if not exists exclude_keywords text;
alter table seen_items add column if not exists topics text;
