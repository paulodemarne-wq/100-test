create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % should have been blocked', label;
end $$;
-- v23: A and B are friends, C is a stranger.
reset role;
insert into auth.users values ('23000000-0000-0000-0000-00000000000a'), ('23000000-0000-0000-0000-00000000000b'), ('23000000-0000-0000-0000-00000000000c') on conflict do nothing;
insert into profiles (id, username, display_name) values
  ('23000000-0000-0000-0000-00000000000a', 'safea', 'SafeA'), ('23000000-0000-0000-0000-00000000000b', 'safeb', 'SafeB'),
  ('23000000-0000-0000-0000-00000000000c', 'safec', 'SafeC') on conflict do nothing;
insert into friendships (requester, addressee, status) values ('23000000-0000-0000-0000-00000000000a', '23000000-0000-0000-0000-00000000000b', 'accepted');
set role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-00000000000a');
insert into messages (recipient, body) values ('23000000-0000-0000-0000-00000000000b', 'Salut, on révise ?');
select pg_temp.expect_fail($$insert into messages (recipient, body) values ('23000000-0000-0000-0000-00000000000b', 'espèce de connard')$$, 'bad word in a message');
select pg_temp.expect_fail($$insert into messages (recipient, body) values ('23000000-0000-0000-0000-00000000000b', 'ENCULÉ')$$, 'bad word with accent and capitals');
-- No false alarms on normal words.
insert into messages (recipient, body) values ('23000000-0000-0000-0000-00000000000b', 'Cassandra a passé l''examen de compétition');
select pg_temp.expect_fail($$update profiles set display_name = 'Petit nazi' where id = auth.uid()$$, 'bad display name');
update profiles set display_name = 'Alice' where id = auth.uid();
-- Report: anyone can report, nobody can read reports from the app.
select report_user('23000000-0000-0000-0000-00000000000c', 'Harcèlement', 'il m''insulte');
select pg_temp.expect_fail($$select * from reports$$, 'reports are not readable');
select pg_temp.expect_fail($$select report_user(auth.uid(), 'moi', null)$$, 'cannot report yourself');
-- Block: A blocks B, the friendship ends, B cannot write or ask again.
select block_user('23000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from friendships where '23000000-0000-0000-0000-00000000000a' in (requester, addressee)) then raise exception 'FAIL friendship must end'; end if;
  if (select count(*) from blocks where blocker = auth.uid()) <> 1 then raise exception 'FAIL block not stored'; end if;
end $$;
select pg_temp.expect_fail($$insert into blocks (blocker, blocked) values (auth.uid(), '23000000-0000-0000-0000-00000000000c')$$, 'cannot write blocks directly');
select pg_temp.expect_fail($$select block_user(auth.uid())$$, 'cannot block yourself');
select pg_temp.as_user('23000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail($$insert into friendships (requester, addressee, status) values (auth.uid(), '23000000-0000-0000-0000-00000000000a', 'pending')$$, 'blocked person cannot send a friend request');
select pg_temp.expect_fail($$insert into messages (recipient, body) values ('23000000-0000-0000-0000-00000000000a', 'coucou')$$, 'blocked person cannot write');
do $$ begin
  if (select count(*) from blocks) <> 0 then raise exception 'FAIL B must not see A''s blocks'; end if;
end $$;
-- Unblock lets A send a request again (A's request to B).
select pg_temp.as_user('23000000-0000-0000-0000-00000000000a');
select unblock_user('23000000-0000-0000-0000-00000000000b');
insert into friendships (requester, addressee, status) values (auth.uid(), '23000000-0000-0000-0000-00000000000b', 'pending');
-- Delete my account: C goes away with their data.
select pg_temp.as_user('23000000-0000-0000-0000-00000000000c');
select delete_my_account();
reset role;
do $$ begin
  if exists (select 1 from profiles where id = '23000000-0000-0000-0000-00000000000c') then raise exception 'FAIL profile must be deleted'; end if;
  if exists (select 1 from auth.users where id = '23000000-0000-0000-0000-00000000000c') then raise exception 'FAIL auth user must be deleted'; end if;
  if (select count(*) from reports where reported is null) <> 1 then raise exception 'FAIL report must stay with no reported user'; end if;
end $$;
delete from friendships where '23000000-0000-0000-0000-00000000000a' in (requester, addressee);
delete from messages where sender::text like '23000000-%' or recipient::text like '23000000-%';
delete from reports;
delete from profiles where id::text like '23000000-%';
select 'V23 TESTS PASSED';
