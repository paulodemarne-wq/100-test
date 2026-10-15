\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
insert into auth.users values (:A), (:B), (:C);
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
insert into profiles (id, username, display_name) values (:A, 'alice', 'Alice');
select pg_temp.expect_fail($$insert into profiles (id, username, display_name) values ('bbbbbbbb-0000-0000-0000-000000000002','bob','Bob')$$, 'create profile for someone else');
select pg_temp.expect_fail($$insert into profiles (id, username, display_name) values ('aaaaaaaa-0000-0000-0000-000000000001','Bad Name','x')$$, 'invalid username');
select pg_temp.as_user(:B); insert into profiles (id, username, display_name) values (:B, 'bob', 'Bob');
select pg_temp.as_user(:C); insert into profiles (id, username, display_name) values (:C, 'carol', 'Carol');
select pg_temp.expect_fail($$insert into profiles (id, username, display_name) values ('cccccccc-0000-0000-0000-000000000003','bob','Dup')$$, 'duplicate username');

-- friend requests
select pg_temp.as_user(:A);
insert into friendships (requester, addressee) values (:A, :B);
select pg_temp.expect_fail($$insert into friendships (requester, addressee) values ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001')$$, 'request on behalf of someone else');
select pg_temp.expect_fail($$insert into friendships (requester, addressee, status) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003','accepted')$$, 'self-accepted request');
update friendships set status = 'accepted' where requester = :A and addressee = :B;
select pg_temp.expect_rows($$select 1 from friendships where status='accepted'$$, 0, 'requester cannot accept own request');
select pg_temp.as_user(:C);
select pg_temp.expect_rows($$select 1 from friendships$$, 0, 'outsider sees no friendship');
select pg_temp.as_user(:B);
select pg_temp.expect_rows($$select 1 from friendships$$, 1, 'addressee sees request');
update friendships set status = 'accepted' where requester = :A and addressee = :B;
select pg_temp.expect_rows($$select 1 from friendships where status='accepted'$$, 1, 'addressee accepted');

-- sessions
select pg_temp.as_user(:A);
insert into study_sessions (subject) values ('Maths');
select pg_temp.expect_fail($$insert into study_sessions (user_id, subject) values ('cccccccc-0000-0000-0000-000000000003','Fake')$$, 'session for someone else');
select pg_temp.as_user(:B);
select pg_temp.expect_rows($$select 1 from study_sessions$$, 1, 'friend sees session');
update study_sessions set status = 'done';
select pg_temp.as_user(:A);
select pg_temp.expect_rows($$select 1 from study_sessions where status='active'$$, 1, 'friend cannot modify my session');
update study_sessions set status = 'done', ended_at = now(), duration_sec = 3600;
select pg_temp.expect_rows($$select 1 from study_sessions where status='done'$$, 1, 'owner ends session');
select pg_temp.as_user(:C);
select pg_temp.expect_rows($$select 1 from study_sessions$$, 0, 'outsider sees no session');
select pg_temp.expect_rows($$select 1 from profiles$$, 3, 'profiles searchable');

-- nudges
select pg_temp.as_user(:A);
insert into nudges (to_user) values (:B);
select pg_temp.expect_fail($$insert into nudges (to_user) values ('cccccccc-0000-0000-0000-000000000003')$$, 'nudge non-friend');
select pg_temp.as_user(:B);
select pg_temp.expect_rows($$select 1 from nudges where seen_at is null$$, 1, 'nudge received');
update nudges set seen_at = now() where to_user = :B;
select pg_temp.expect_rows($$select 1 from nudges where seen_at is null$$, 0, 'nudge marked seen');

-- unfriend
select pg_temp.as_user(:B);
delete from friendships where requester = :A and addressee = :B;
select pg_temp.expect_rows($$select 1 from study_sessions$$, 0, 'ex-friend no longer sees sessions');

-- storage (the photo is free)
select pg_temp.as_user(:A);
insert into storage.objects (bucket_id, name) values ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/avatar-1.jpg');
select pg_temp.expect_fail($$insert into storage.objects (bucket_id, name) values ('avatars', 'bbbbbbbb-0000-0000-0000-000000000002/avatar-1.jpg')$$, 'upload into someone else folder');
select 'ALL RLS TESTS PASSED';
