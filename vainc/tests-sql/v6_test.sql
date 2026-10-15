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
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
-- Free things only: allowed.
select public.save_world(jsonb_build_object('tiles', repeat('g', 200) || repeat('p', 56), 'objects', '[["pine",1,2,0],["fence",3,3,1],["rock",15,15,3]]'::jsonb));
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and jsonb_array_length(world->'objects') = 3$$, 1, 'free world saved');
select pg_temp.expect_fail($$update profiles set world = '{}' where id = auth.uid()$$, 'cheat world');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('w', 256), 'objects', '[]'::jsonb))$$, 'water not owned');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('g', 255), 'objects', '[]'::jsonb))$$, 'bad size');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('x', 256), 'objects', '[]'::jsonb))$$, 'bad tile');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('g', 256), 'objects', '[["castle",1,1,0]]'::jsonb))$$, 'castle not owned');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('g', 256), 'objects', '[["pine",16,1,0]]'::jsonb))$$, 'out of island');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('g', 256), 'objects', '[["pine",1.5,1,0]]'::jsonb))$$, 'half cell');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('g', 256), 'objects', '[["grass",1,1,0]]'::jsonb))$$, 'tile as object');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('g', 256), 'objects', '[["cap",1,1,0]]'::jsonb))$$, 'accessory as object');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('g', 256), 'objects', (select jsonb_agg(jsonb_build_array('pine', 1, 1, 0)) from generate_series(1, 201))))$$, 'too many');
select pg_temp.expect_fail($$select public.buy_item('pine')$$, 'buy free item');
-- E bought one cabin (v5 test): one can be placed, not two.
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('tiles', repeat('g', 256), 'objects', '[["cabin",1,1,0],["cabin",5,5,2]]'::jsonb))$$, 'two cabins with one bought');
select public.save_world(jsonb_build_object('tiles', repeat('g', 256), 'objects', '[["cabin",1,1,0],["pine",5,5,2],["pine",6,5,0]]'::jsonb));
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and world->'objects'->0->>0 = 'cabin'$$, 1, 'one cabin placed, free pines many times');
select pg_temp.as_user(:A);
select pg_temp.expect_rows($$select 1 from profiles where world->'objects'->0->>0 = 'cabin'$$, 1, 'others see the island');
select 'V6 TESTS PASSED';
