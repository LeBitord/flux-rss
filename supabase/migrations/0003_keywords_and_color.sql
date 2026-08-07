alter table feeds add column if not exists keywords text;
alter table categories add column if not exists color text not null default '#5865F2';
