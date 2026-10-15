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
-- v20: gift links. P pays, Q and R never had Lockin+, S already had it.
reset role;
insert into auth.users values ('20000000-0000-0000-0000-00000000000a'), ('20000000-0000-0000-0000-00000000000b'), ('20000000-0000-0000-0000-00000000000c'), ('20000000-0000-0000-0000-00000000000d') on conflict do nothing;
insert into profiles (id, username, display_name) values
  ('20000000-0000-0000-0000-00000000000a', 'paula', 'Paula'), ('20000000-0000-0000-0000-00000000000b', 'quentin', 'Quentin'),
  ('20000000-0000-0000-0000-00000000000c', 'rose', 'Rose'), ('20000000-0000-0000-0000-00000000000d', 'sami', 'Sami') on conflict do nothing;
select grant_plus('20000000-0000-0000-0000-00000000000a', 30, 'paid');
select grant_plus('20000000-0000-0000-0000-00000000000d', 7, 'admin');
set role authenticated;
-- Someone without a paid Lockin+ cannot make links.
select pg_temp.as_user('20000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail($$select create_gift_link()$$, 'no link without paying');
select pg_temp.expect_fail($$insert into plus_gifts (code, giver) values ('HACK1234', auth.uid())$$, 'cannot insert links');
select pg_temp.as_user('20000000-0000-0000-0000-00000000000a');
select create_gift_link() as link \gset
select pg_temp.expect_rows(format($$select 1 where create_gift_link() = %L$$, :'link'), 1, 'sharing again gives the same link');
select pg_temp.expect_rows($$select 1 where trials_left(auth.uid()) = 4$$, 1, 'a waiting link holds one trial');
select pg_temp.expect_fail(format($$select claim_gift(%L)$$, :'link'), 'cannot take my own gift');
-- Sami already had Lockin+.
select pg_temp.as_user('20000000-0000-0000-0000-00000000000d');
select pg_temp.expect_fail(format($$select claim_gift(%L)$$, :'link'), 'not for people who had Lockin+');
select pg_temp.expect_rows($$select 1 from unseen_plus() where source = 'admin'$$, 1, 'Sami sees his Lockin+ once');
select mark_plus_seen();
select pg_temp.expect_rows($$select 1 from unseen_plus()$$, 0, 'then never again');
-- Quentin opens the link (lower case works too).
select pg_temp.as_user('20000000-0000-0000-0000-00000000000b');
select pg_temp.expect_rows(format($$select 1 from gift_info(%L) where giver_name = 'Paula' and not claimed and not mine$$, lower(:'link')), 1, 'gift info');
select pg_temp.expect_rows(format($$select 1 where claim_gift(%L) = 'Paula'$$, lower(:'link')), 1, 'claim');
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and premium_until > now() + interval '6 days'$$, 1, 'Quentin has 7 days');
select pg_temp.expect_rows($$select 1 from unseen_plus()$$, 0, 'already shown on the gift screen');
-- Rose is too late.
select pg_temp.as_user('20000000-0000-0000-0000-00000000000c');
select pg_temp.expect_fail(format($$select claim_gift(%L)$$, :'link'), 'already taken');
select pg_temp.expect_fail($$select claim_gift('NOPE0000')$$, 'unknown link');
select pg_temp.expect_rows(format($$select 1 from gift_info(%L) where claimed$$, :'link'), 1, 'link shows as taken');
select pg_temp.expect_rows($$select 1 from plus_gifts$$, 0, 'cannot list others links');
-- Paula: 4 left, a new link next time.
select pg_temp.as_user('20000000-0000-0000-0000-00000000000a');
select pg_temp.expect_rows($$select 1 where trials_left(auth.uid()) = 4$$, 1, 'one trial used');
select pg_temp.expect_rows(format($$select 1 where create_gift_link() <> %L$$, :'link'), 1, 'new link after a claim');
select pg_temp.expect_rows($$select 1 from plus_gifts$$, 2, 'Paula sees her links');
-- Old friend-list gifts also count: 3 more links then nothing.
select create_gift_link(); -- same waiting one
reset role;
insert into plus_gifts (code, giver) values ('EXTRA001', '20000000-0000-0000-0000-00000000000a'), ('EXTRA002', '20000000-0000-0000-0000-00000000000a'), ('EXTRA003', '20000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-00000000000a');
select pg_temp.expect_rows($$select 1 where trials_left(auth.uid()) = 0$$, 1, 'five used');
select 'V20 TESTS PASSED';
