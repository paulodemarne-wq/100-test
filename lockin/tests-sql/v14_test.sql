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
\set E '''eeeeeeee-0000-0000-0000-00000000000e'''
reset role;
update profiles set premium_until = null, total_seconds = 1000 * 3600, spent_seconds = 0, avatar_url = null, badge = null, decoration = null where id = :E;
set role authenticated;
select pg_temp.as_user(:E);
-- Without Lockin+
update profiles set avatar_url = 'https://x/free.jpg' where id = auth.uid();
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and avatar_url = 'https://x/free.jpg'$$, 1, 'photo is free');
select pg_temp.expect_fail($$update profiles set badge = 'flame' where id = auth.uid()$$, 'badge needs Lockin+');
select pg_temp.expect_fail($$update profiles set decoration = 'crown' where id = auth.uid()$$, 'decoration needs Lockin+');
update profiles set badge_color = 'or' where id = auth.uid();
select pg_temp.expect_fail($$update profiles set premium_until = now() + interval '1 year' where id = auth.uid()$$, 'cannot give myself Lockin+');
select pg_temp.expect_fail($$select buy_item('egg_plus')$$, 'Lockin+ egg needs Lockin+');
update profiles set display_name = 'Eve' where id = auth.uid();
select pg_temp.expect_rows($$select 1 from todays_deals() d join shop_items s on s.id = d.item_id where s.premium$$, 0, 'no Lockin+ items in deals');
select save_world(('{"size":16,"sea":false,"tiles":"' || repeat('g', 256) || '","objects":[["portal",3,3,0],["pine",4,4,0]]}')::jsonb);
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and jsonb_array_length(world->'objects') = 1 and world->'objects'->0->>0 = 'pine'$$, 1, 'Lockin+ deco taken off without Lockin+');
-- With Lockin+
reset role;
update profiles set premium_until = now() + interval '1 month' where id = :E;
set role authenticated;
update profiles set badge = 'flame', decoration = 'crown' where id = auth.uid();
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and badge = 'flame' and decoration = 'crown'$$, 1, 'Lockin+ badge and decoration');
select pg_temp.expect_fail($$update profiles set badge = 'lol' where id = auth.uid()$$, 'unknown badge');
select pg_temp.expect_fail($$update profiles set decoration = 'lol' where id = auth.uid()$$, 'unknown decoration');
select pg_temp.expect_fail($$update profiles set badge_color = 'rose' where id = auth.uid()$$, 'unknown badge color');
select save_world(('{"size":16,"sea":false,"tiles":"' || repeat('g', 256) || '","objects":[["portal",3,3,0],["gazebo",5,5,1]]}')::jsonb);
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and jsonb_array_length(world->'objects') = 2$$, 1, 'Lockin+ decos placed');
select buy_item('egg_plus') as egg_id \gset
select pg_temp.expect_rows($$select 1 from pets where id = '$$ || :'egg_id' || $$' and egg = 'plus' and species is null$$, 1, 'Lockin+ egg bought');
reset role;
update pets set xp_seconds = 20000 where id = :'egg_id';
select public.hatch_if_ready(:'egg_id');
select pg_temp.expect_rows($$select 1 from pets where id = '$$ || :'egg_id' || $$' and species between 30 and 39$$, 1, 'Lockin+ egg hatches an exclusive creature');
-- Ended Lockin+: badge can be taken off, not put back.
update profiles set premium_until = now() - interval '1 day' where id = :E;
set role authenticated;
select pg_temp.as_user(:E);
update profiles set badge = null where id = auth.uid();
select pg_temp.expect_fail($$update profiles set badge = 'star' where id = auth.uid()$$, 'badge after Lockin+ ended');
select 'V14 TESTS PASSED';
