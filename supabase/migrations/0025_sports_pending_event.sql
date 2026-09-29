-- Next match remembered so its score can be fetched by id once played: TheSportsDB's
-- free "last events" endpoint misses away matches (see lib/sports.ts).
alter table sports_teams add column if not exists pending_event_id text;
