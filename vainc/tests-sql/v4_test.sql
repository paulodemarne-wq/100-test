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
select pg_temp.as_user(:A);
select pg_temp.expect_rows($$select 1 from pets where user_id = auth.uid()$$, 1, 'existing user got a pet (backfill)');
select pg_temp.expect_rows($$select 1 from profiles p join pets on pets.id = p.active_pet_id where p.id = auth.uid() and pets.species is null$$, 1, 'A has 1h: still an egg (hatch at 5h30)');
select pg_temp.expect_fail($$update pets set xp_seconds = 999999$$, 'cheat pet xp');
select pg_temp.expect_fail($$update profiles set spent_seconds = 0 where id = auth.uid()$$, 'cheat wallet');
select pg_temp.expect_fail($$insert into inventory (user_id, item_id) values (auth.uid(), 'crown')$$, 'free item');
select pg_temp.expect_fail($$select public.buy_item('cap')$$, 'A cannot afford a 10h cap with 1h');
-- New user E: egg hatches at 5h30, then buys with 10h+.
reset role; insert into auth.users values ('eeeeeeee-0000-0000-0000-00000000000e'); set role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
insert into profiles (id, username, display_name) values (auth.uid(), 'eve', 'Eve');
select pg_temp.expect_rows($$select 1 from pets where user_id = auth.uid() and species is null$$, 1, 'new user egg');
insert into study_sessions (id, subject) values ('99999999-0000-0000-0000-000000000001', 'x');
update study_sessions set status = 'done', duration_sec = 18000, ended_at = now() where id = '99999999-0000-0000-0000-000000000001';
select pg_temp.expect_rows($$select 1 from pets where user_id = auth.uid() and species is null and xp_seconds = 18000$$, 1, 'egg fed 5h, still egg');
insert into study_sessions (id, subject) values ('99999999-0000-0000-0000-000000000002', 'x');
update study_sessions set status = 'done', duration_sec = 18000, ended_at = now() where id = '99999999-0000-0000-0000-000000000002';
select pg_temp.expect_rows($$select 1 from pets where user_id = auth.uid() and species is not null and xp_seconds = 36000$$, 1, 'egg hatched after 10h');
select public.buy_item('cap');
select pg_temp.expect_fail($$select public.buy_item('cap')$$, 'buy twice');
select pg_temp.expect_fail($$select public.buy_item('scarf')$$, 'not enough hours for 30h scarf');
select pg_temp.expect_fail($$select public.buy_item('egg')$$, 'not enough hours for 100h egg');
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and spent_seconds = 36000$$, 1, 'hours spent');
select public.equip_item((select active_pet_id from profiles where id = auth.uid()), 'head', 'cap');
select pg_temp.expect_rows($$select 1 from pets where equipped->>'head' = 'cap'$$, 1, 'cap equipped');
select pg_temp.expect_fail($$select public.equip_item((select active_pet_id from profiles where id = auth.uid()), 'eyes', 'cap')$$, 'wrong slot');
select pg_temp.expect_fail($$select public.equip_item((select active_pet_id from profiles where id = auth.uid()), 'head', 'crown')$$, 'unowned item');
select public.equip_item((select active_pet_id from profiles where id = auth.uid()), 'head', null);
select pg_temp.expect_rows($$select 1 from pets where user_id = auth.uid() and equipped = '{}'::jsonb$$, 1, 'unequipped');
select pg_temp.expect_fail($$select public.set_active_pet((select id from pets where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1))$$, 'use someone else pet');
select pg_temp.as_user(:B);
select pg_temp.expect_rows($$select 1 from pets where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 1, 'friend sees pet');
select pg_temp.as_user(:C);
select pg_temp.expect_rows($$select 1 from pets where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 0, 'stranger cannot see pet');
select 'V4 TESTS PASSED';
