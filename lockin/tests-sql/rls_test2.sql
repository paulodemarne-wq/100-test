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
grant execute on all functions in schema pg_temp to authenticated;
set role authenticated;
select pg_temp.as_user(:A);
insert into friendships (requester, addressee) values (:A, :B);
select pg_temp.as_user(:B);
select pg_temp.expect_fail($$insert into friendships (requester, addressee) values ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001')$$, 'duplicate reverse request');
select pg_temp.expect_fail($$update friendships set requester = 'cccccccc-0000-0000-0000-000000000003', status = 'accepted'$$, 'hijack friendship');
update friendships set status = 'accepted' where requester = :A and addressee = :B;
select pg_temp.as_user(:A);
insert into nudges (to_user) values (:B);
select pg_temp.as_user(:B);
select pg_temp.expect_fail($$update nudges set from_user = 'cccccccc-0000-0000-0000-000000000003'$$, 'forge nudge sender');
update nudges set seen_at = now();
select 'EXTRA TESTS PASSED';
