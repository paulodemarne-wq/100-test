\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % should have been blocked', label;
end $$;
create or replace function pg_temp.expect_rows(q text, n int, label text) returns void language plpgsql as $$
declare c int;
begin execute 'select count(*) from (' || q || ') x' into c;
  if c <> n then raise exception 'FAIL: % expected % rows, got %', label, n, c; end if;
  raise notice 'OK %: % rows', label, c;
end $$;
grant execute on all functions in schema pg_temp to authenticated;
truncate net.calls;
set role authenticated;
-- A and B are friends (from v2 test). C is not.
select pg_temp.as_user(:A);
select pg_temp.expect_fail($$update profiles set total_seconds = 999999 where id = auth.uid()$$, 'cheat total_seconds');
update profiles set display_name = 'Alice2', weekly_goal_minutes = 300 where id = auth.uid();
insert into study_sessions (id, subject, tasks) values ('ffffffff-0000-0000-0000-000000000001', 'Compta', '[{"text":"chap 3","done":false}]');
update study_sessions set status = 'done', duration_sec = 3600, ended_at = now(), paused_seconds = 300, tasks = '[{"text":"chap 3","done":true}]' where id = 'ffffffff-0000-0000-0000-000000000001';
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and total_seconds >= 3600$$, 1, 'total_seconds maintained');
select pg_temp.expect_fail($$update study_sessions set tasks = '"x"' where id = 'ffffffff-0000-0000-0000-000000000001'$$, 'tasks must be array');
select pg_temp.expect_fail($$insert into session_reactions (session_id, emoji) values ('ffffffff-0000-0000-0000-000000000001', '🔥')$$, 'react to own session');
select pg_temp.as_user(:B);
insert into session_reactions (session_id, emoji) values ('ffffffff-0000-0000-0000-000000000001', '🔥');
update session_reactions set emoji = '💪' where user_id = auth.uid();
select pg_temp.expect_fail($$insert into session_reactions (session_id, emoji) values ('ffffffff-0000-0000-0000-000000000001', '🍕')$$, 'unknown emoji');
select pg_temp.as_user(:C);
select pg_temp.expect_fail($$insert into session_reactions (session_id, emoji) values ('ffffffff-0000-0000-0000-000000000001', '💀')$$, 'non-friend reaction');
select pg_temp.expect_rows($$select 1 from session_reactions$$, 0, 'non-friend sees no reactions');
select pg_temp.as_user(:A);
select pg_temp.expect_rows($$select 1 from session_reactions where emoji = '💪'$$, 1, 'owner sees reaction');
reset role;
select string_agg(body->0->>'title' || ' / ' || (body->0->>'body'), ' | ') as pushes from net.calls;
select 'V3 TESTS PASSED';
