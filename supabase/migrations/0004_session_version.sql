alter table admin_settings add column if not exists session_version integer not null default 0;
