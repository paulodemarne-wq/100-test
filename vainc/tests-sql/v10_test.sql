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
-- Featured account (A, from admin.sql): unlimited hours.
select pg_temp.as_user(:A);
create temp table b as select spent_seconds from profiles where id = auth.uid();
select public.buy_item('egg');
select public.buy_item('castle');
select public.buy_item('pirateship');
select pg_temp.expect_rows($$select 1 from profiles, b where id = auth.uid() and profiles.spent_seconds = b.spent_seconds$$, 1, 'featured pays nothing');
-- Normal players still pay.
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
create temp table e as select spent_seconds from profiles where id = auth.uid();
select public.buy_item('tent');
select pg_temp.expect_rows($$select 1 from profiles, e where id = auth.uid() and profiles.spent_seconds = e.spent_seconds + 10*3600$$, 1, 'others still pay');
select 'V10 TESTS PASSED';
