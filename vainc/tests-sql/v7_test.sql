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
-- E: give lots of hours (24 sessions of 10 h = 240 h more).
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
do $$ begin for i in 10..33 loop
  insert into study_sessions (id, subject) values (('99999999-0000-0000-0000-0000000000' || i)::uuid, 'x');
  update study_sessions set status = 'done', duration_sec = 36000, ended_at = now() where id = ('99999999-0000-0000-0000-0000000000' || i)::uuid;
end loop; end $$;
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 20, 'tiles', repeat('g', 400), 'objects', '[]'::jsonb))$$, 'size 20 not bought');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 16, 'sea', true, 'tiles', repeat('g', 256), 'objects', '[]'::jsonb))$$, 'sea not bought');
select pg_temp.expect_fail($$select public.buy_item('size24')$$, 'size 24 before 20');
select public.buy_item('size20');
select public.buy_item('sea');
select public.buy_item('rowboat');
select public.buy_item('rowboat');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 24, 'tiles', repeat('g', 576), 'objects', '[]'::jsonb))$$, 'size 24 not bought');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 20, 'tiles', repeat('g', 256), 'objects', '[]'::jsonb))$$, 'tiles do not match size');
-- Boat on the sea, around the island.
select public.save_world(jsonb_build_object('size', 20, 'sea', true, 'tiles', repeat('g', 400), 'objects', '[["rowboat",-3,5,0],["rowboat",22,23,1],["pine",19,19,0]]'::jsonb));
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and (world->>'size')::int = 20 and (world->>'sea')::boolean$$, 1, 'big island with sea saved');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 20, 'sea', true, 'tiles', repeat('g', 400), 'objects', '[["rowboat",-5,5,0]]'::jsonb))$$, 'boat too far');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 20, 'sea', false, 'tiles', repeat('g', 400), 'objects', '[["rowboat",-2,5,0]]'::jsonb))$$, 'boat without sea');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 20, 'sea', true, 'tiles', repeat('g', 400), 'objects', '[["rowboat",3,3,0]]'::jsonb))$$, 'boat on grass');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 20, 'sea', true, 'tiles', repeat('g', 400), 'objects', '[["pine",-1,3,0]]'::jsonb))$$, 'tree in the sea');
select public.buy_item('water');
select public.save_world(jsonb_build_object('size', 20, 'sea', false, 'tiles', 'w' || repeat('g', 399), 'objects', '[["rowboat",0,0,0]]'::jsonb));
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and world->'objects'->0->>0 = 'rowboat'$$, 1, 'boat on a pond');
select public.buy_item('pirate');
select public.equip_item((select active_pet_id from profiles where id = auth.uid()), 'head', 'pirate');
select pg_temp.expect_rows($$select 1 from pets where user_id = auth.uid() and equipped->>'head' = 'pirate'$$, 1, 'new accessory equipped');
select 'V7 TESTS PASSED';
