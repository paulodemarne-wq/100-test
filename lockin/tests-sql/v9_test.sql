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
-- Island objects are bought one by one.
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
do $$ begin for i in 0..9 loop
  insert into study_sessions (id, subject) values (('99999999-0000-0000-0000-0000000001' || i || '0')::uuid, 'x');
  update study_sessions set status = 'done', duration_sec = 36000, ended_at = now() where id = ('99999999-0000-0000-0000-0000000001' || i || '0')::uuid;
end loop; end $$;
create temp table q0 as select coalesce((select quantity from inventory where user_id = auth.uid() and item_id = 'tent'), 0) as n, (select spent_seconds from profiles where id = auth.uid()) as spent;
select public.buy_item('tent');
select public.buy_item('tent');
select pg_temp.expect_rows($$select 1 from inventory, q0 where user_id = auth.uid() and item_id = 'tent' and quantity = q0.n + 2$$, 1, 'two tents in stock');
select pg_temp.expect_rows($$select 1 from profiles, q0 where id = auth.uid() and spent_seconds = q0.spent + 20*3600$$, 1, 'paid 10 h each');
select pg_temp.expect_fail($$select public.buy_item('cap')$$, 'accessories still once');
select pg_temp.expect_fail($$select public.buy_item('water')$$, 'ground tiles still once');
select public.save_world(jsonb_build_object('size', 20, 'tiles', repeat('g', 400), 'objects', '[["tent",1,1,0],["tent",2,2,0]]'::jsonb));
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 20, 'tiles', repeat('g', 400), 'objects', '[["tent",1,1,0],["tent",2,2,0],["tent",3,3,0]]'::jsonb))$$, 'three tents with two bought');
select pg_temp.expect_fail($$update inventory set quantity = 99 where user_id = auth.uid()$$, 'cannot change own stock');
select 'V9 TESTS PASSED';
