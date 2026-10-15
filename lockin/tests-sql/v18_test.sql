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
-- G has Lockin+ (paid in v15), pote 1 had a 7-day trial; take it away for this test.
reset role;
update profiles set premium_until = null where id = :P1;
insert into pets (user_id) values (:P1), (:G);
set role authenticated;
select pg_temp.as_user(:P1);
select pg_temp.expect_fail($$update profiles set title = 'Machine de guerre' where id = auth.uid()$$, 'title needs Lockin+');
select pg_temp.expect_fail($$select rename_pet((select id from pets where user_id = auth.uid() limit 1), 'Rex')$$, 'rename needs Lockin+');
select pg_temp.expect_fail($$update pets set nickname = 'Rex'$$, 'no direct pet edit');
select pg_temp.as_user(:G);
update profiles set title = 'Machine de guerre' where id = auth.uid();
select pg_temp.expect_fail($$update profiles set title = 'Le meilleur' where id = auth.uid()$$, 'only listed titles');
select rename_pet((select id from pets where user_id = auth.uid() limit 1), '  Rex  ');
select pg_temp.expect_rows($$select 1 from pets where user_id = auth.uid() and nickname = 'Rex'$$, 1, 'pet renamed');
select pg_temp.expect_fail($$select rename_pet((select id from pets where user_id = '00000001-0000-0000-0000-000000000000' limit 1), 'Volé')$$, 'cannot rename others pets');
select 'V18 TESTS PASSED';
