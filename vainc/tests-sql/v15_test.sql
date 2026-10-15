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
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
-- Fresh people for this test: F (sponsor, friend of G), G (new user).
reset role;
insert into auth.users values ('ffffffff-0000-0000-0000-00000000000f'), ('99999999-0000-0000-0000-000000000099') on conflict do nothing;
insert into profiles (id, username, display_name) values ('ffffffff-0000-0000-0000-00000000000f', 'fanny', 'Fanny'), ('99999999-0000-0000-0000-000000000099', 'gabin', 'Gabin') on conflict do nothing;
insert into friendships (requester, addressee, status) values ('ffffffff-0000-0000-0000-00000000000f', '99999999-0000-0000-0000-000000000099', 'accepted') on conflict do nothing;
select referral_code as fcode from profiles where id = 'ffffffff-0000-0000-0000-00000000000f' \gset
set role authenticated;
-- Clients can't touch grants or Vainc+ directly.
select pg_temp.as_user('99999999-0000-0000-0000-000000000099');
select pg_temp.expect_fail($$select grant_plus(auth.uid(), 365, 'paid')$$, 'cannot grant myself');
select pg_temp.expect_fail($$insert into plus_grants (user_id, source, days) values (auth.uid(), 'paid', 365)$$, 'cannot insert grants');
select pg_temp.expect_fail($$update profiles set referred_by = 'ffffffff-0000-0000-0000-00000000000f' where id = auth.uid()$$, 'cannot set sponsor directly');
select pg_temp.expect_fail($$select use_referral_code('ZZZZZZ')$$, 'unknown code');
select use_referral_code(lower(:'fcode'));
select pg_temp.expect_fail($$select use_referral_code('$$ || :'fcode' || $$')$$, 'only one sponsor');
-- F has no paid Vainc+: cannot give trials.
select pg_temp.as_user('ffffffff-0000-0000-0000-00000000000f');
select pg_temp.expect_rows($$select 1 where trials_left(auth.uid()) = 0$$, 1, 'no trials without paying');
select pg_temp.expect_fail($$select give_trial('99999999-0000-0000-0000-000000000099')$$, 'cannot give trial without paying');
-- G pays: both get 30 days.
reset role;
select grant_plus('99999999-0000-0000-0000-000000000099', 30, 'paid');
set role authenticated;
select pg_temp.expect_rows($$select 1 from profiles where id = 'ffffffff-0000-0000-0000-00000000000f' and premium_until > now() + interval '29 days'$$, 1, 'sponsor got a month');
select pg_temp.expect_rows($$select 1 from profiles where id = '99999999-0000-0000-0000-000000000099' and premium_until > now() + interval '59 days'$$, 1, 'friend got 30 + 30');
reset role;
select grant_plus('99999999-0000-0000-0000-000000000099', 30, 'paid');
set role authenticated;
select pg_temp.expect_rows($$select 1 from plus_grants where source = 'referral'$$, 2, 'referral paid once only');
-- G now pays and can give 5 trials, only to friends who never had Vainc+.
select pg_temp.as_user('99999999-0000-0000-0000-000000000099');
select pg_temp.expect_rows($$select 1 where trials_left(auth.uid()) = 5$$, 1, '5 trials to give');
select pg_temp.expect_fail($$select give_trial('ffffffff-0000-0000-0000-00000000000f')$$, 'friend already had Vainc+');
select pg_temp.expect_fail($$select give_trial('aaaaaaaa-0000-0000-0000-000000000001')$$, 'not a friend');
reset role;
do $$
declare i int;
begin
  for i in 1..6 loop
    insert into auth.users values (('0000000' || i || '-0000-0000-0000-000000000000')::uuid) on conflict do nothing;
    insert into profiles (id, username, display_name) values (('0000000' || i || '-0000-0000-0000-000000000000')::uuid, 'pote' || i, 'Pote ' || i) on conflict do nothing;
    insert into friendships (requester, addressee, status) values ('99999999-0000-0000-0000-000000000099', ('0000000' || i || '-0000-0000-0000-000000000000')::uuid, 'accepted') on conflict do nothing;
  end loop;
end $$;
set role authenticated;
select pg_temp.as_user('99999999-0000-0000-0000-000000000099');
select pg_temp.expect_rows($$select 1 from trial_candidates()$$, 6, 'six friends can get a trial');
select give_trial('00000001-0000-0000-0000-000000000000');
select pg_temp.expect_fail($$select give_trial('00000001-0000-0000-0000-000000000000')$$, 'same friend twice');
select give_trial('00000002-0000-0000-0000-000000000000');
select give_trial('00000003-0000-0000-0000-000000000000');
select give_trial('00000004-0000-0000-0000-000000000000');
select give_trial('00000005-0000-0000-0000-000000000000');
select pg_temp.expect_fail($$select give_trial('00000006-0000-0000-0000-000000000000')$$, 'sixth trial refused');
select pg_temp.expect_rows($$select 1 from profiles where id = '00000005-0000-0000-0000-000000000000' and premium_until between now() + interval '6 days' and now() + interval '8 days'$$, 1, 'trial is 7 days');
-- A trial user cannot give trials.
select pg_temp.as_user('00000001-0000-0000-0000-000000000000');
select pg_temp.expect_rows($$select 1 where trials_left(auth.uid()) = 0$$, 1, 'trial users give nothing');
select 'V15 TESTS PASSED';
