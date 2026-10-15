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
\set F '''ffffffff-0000-0000-0000-00000000000f'''
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
select pg_temp.as_user(:G);
insert into messages (recipient, body) values (:F, 'On vainc à 20 h ?');
select pg_temp.expect_fail($$insert into messages (recipient, body) values ('aaaaaaaa-0000-0000-0000-000000000001', 'salut')$$, 'only to friends');
select pg_temp.expect_fail($$insert into messages (sender, recipient, body) values ('ffffffff-0000-0000-0000-00000000000f', '99999999-0000-0000-0000-000000000099', 'fake')$$, 'cannot send as someone else');
select pg_temp.expect_fail($$insert into messages (recipient, body) values ('ffffffff-0000-0000-0000-00000000000f', '')$$, 'no empty message');
select pg_temp.as_user(:A);
select pg_temp.expect_rows($$select 1 from messages$$, 0, 'others see nothing');
select pg_temp.as_user(:F);
select pg_temp.expect_rows($$select 1 from messages where read_at is null$$, 1, 'recipient sees it unread');
update messages set read_at = now() where recipient = auth.uid();
select pg_temp.expect_fail($$update messages set body = 'changed'$$, 'cannot edit text');
insert into messages (recipient, body) values (:G, 'Grave 🔒');
select pg_temp.as_user(:G);
select pg_temp.expect_rows($$select 1 from messages where read_at is not null$$, 1, 'read receipt');
update messages set read_at = now() where sender = auth.uid();
select pg_temp.expect_rows($$select 1 from messages where sender = auth.uid() and read_at is not null$$, 1, 'cannot mark own sent as read');
select 'V17 TESTS PASSED';
