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
\set G '''99999999-0000-0000-0000-000000000099'''
\set P1 '''00000001-0000-0000-0000-000000000000'''
-- Accessory of the month
select pg_temp.as_user(:P1);
select pg_temp.expect_fail($$select claim_monthly_accessory()$$, 'monthly accessory needs Vainc+');
select pg_temp.as_user(:G);
select claim_monthly_accessory() as acc \gset
select pg_temp.expect_rows($$select 1 from inventory where user_id = auth.uid() and item_id = '$$ || :'acc' || $$'$$, 1, 'monthly accessory claimed');
select claim_monthly_accessory();
select pg_temp.expect_fail($$select buy_item('tiara')$$, 'cannot buy monthly accessories');
-- Extra islands: Vainc+ only, free snow on island 2, one stock for all islands.
select pg_temp.as_user(:P1);
select pg_temp.expect_fail($$select save_world('{"size":16,"sea":false,"tiles":"' || repeat('n', 256) || '","objects":[]}'::jsonb, 2)$$, 'island 2 needs Vainc+');
select pg_temp.as_user(:G);
select save_world(('{"size":16,"sea":false,"tiles":"' || repeat('n', 256) || '","objects":[]}')::jsonb, 2);
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and world2->>'tiles' like 'nnn%'$$, 1, 'snow island saved');
select pg_temp.expect_fail($$select save_world('{"size":16,"sea":false,"tiles":"' || repeat('c', 256) || '","objects":[]}'::jsonb, 2)$$, 'clouds not free on island 2');
select save_world(('{"size":16,"sea":false,"tiles":"' || repeat('c', 256) || '","objects":[]}')::jsonb, 3);
reset role;
insert into inventory (user_id, item_id, quantity) values (:G, 'tent', 1) on conflict (user_id, item_id) do update set quantity = 1;
set role authenticated;
select pg_temp.as_user(:G);
select save_world(('{"size":16,"sea":false,"tiles":"' || repeat('g', 256) || '","objects":[["tent",2,2,0]]}')::jsonb);
select pg_temp.expect_fail($$select save_world('{"size":16,"sea":false,"tiles":"' || repeat('n', 256) || '","objects":[["tent",3,3,0]]}'::jsonb, 2)$$, 'same tent on two islands');
select pg_temp.expect_fail($$select save_world('{"size":16,"sea":false,"tiles":"' || repeat('g', 256) || '","objects":[]}'::jsonb, 4)$$, 'only 3 islands');
-- Group lock-ins: 8 people without Vainc+, 30 with it.
reset role;
insert into vainc_events (id, host, title, starts_at) values ('77777777-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000000', 'Révisions', now() + interval '1 hour');
insert into event_members (event_id, user_id) select '77777777-0000-0000-0000-000000000001', id from profiles order by id limit 8;
select pg_temp.expect_fail($$insert into event_members (event_id, user_id) select '77777777-0000-0000-0000-000000000001', id from profiles order by id offset 8 limit 1$$, 'ninth person refused without Vainc+');
update profiles set premium_until = now() + interval '1 day' where id = '00000001-0000-0000-0000-000000000000';
insert into event_members (event_id, user_id) select '77777777-0000-0000-0000-000000000001', id from profiles order by id offset 8 limit 1;
select pg_temp.expect_rows($$select 1 from event_members where event_id = '77777777-0000-0000-0000-000000000001'$$, 9, 'more with Vainc+');
select 'V19 TESTS PASSED';
