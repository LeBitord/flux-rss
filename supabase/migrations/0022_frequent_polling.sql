-- Categories also polled during the day by /api/poll-frequent, on top of the 05:00 pass.
alter table categories add column if not exists frequent_polling boolean not null default false;
