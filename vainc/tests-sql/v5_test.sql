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
set role authenticated;
-- E (from v4 test) has 10h of sessions and spent 10h on a cap. Give E 30h more.
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
insert into study_sessions (id, subject) values ('99999999-0000-0000-0000-000000000003', 'x');
update study_sessions set status = 'done', duration_sec = 36000, ended_at = now() where id = '99999999-0000-0000-0000-000000000003';
insert into study_sessions (id, subject) values ('99999999-0000-0000-0000-000000000004', 'x');
update study_sessions set status = 'done', duration_sec = 36000, ended_at = now() where id = '99999999-0000-0000-0000-000000000004';
insert into study_sessions (id, subject) values ('99999999-0000-0000-0000-000000000005', 'x');
update study_sessions set status = 'done', duration_sec = 36000, ended_at = now() where id = '99999999-0000-0000-0000-000000000005';
select pg_temp.expect_fail($$update profiles set garden = '{"house":"castle"}' where id = auth.uid()$$, 'cheat garden');
select pg_temp.expect_fail($$select public.set_garden('house', 'castle')$$, 'unowned house');
select public.buy_item('cabin');
select pg_temp.expect_fail($$select public.buy_item('cabin')$$, 'buy house twice');
select pg_temp.expect_fail($$select public.set_garden('tree', 'cabin')$$, 'house in tree slot');
select pg_temp.expect_fail($$select public.set_garden('head', 'cap')$$, 'pet slot in garden');
select public.set_garden('house', 'cabin');
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and garden->>'house' = 'cabin' and spent_seconds = 36000 + 108000$$, 1, 'cabin placed and paid');
select pg_temp.expect_fail($$select public.buy_item('castle')$$, 'castle too expensive');
select pg_temp.as_user(:A);
select pg_temp.expect_rows($$select 1 from profiles where garden->>'house' = 'cabin'$$, 1, 'others can see the garden');
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
select public.set_garden('house', null);
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and garden = '{}'::jsonb$$, 1, 'house removed');
select 'V5 TESTS PASSED';
