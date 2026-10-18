create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % should have been blocked', label;
end $$;
-- v22: skins. P has 100 h and no Vainc+, Q has Vainc+ and 0 h.
reset role;
insert into auth.users values ('22000000-0000-0000-0000-00000000000a'), ('22000000-0000-0000-0000-00000000000b') on conflict do nothing;
insert into profiles (id, username, display_name, total_seconds) values
  ('22000000-0000-0000-0000-00000000000a', 'skinp', 'SkinP', 100 * 3600), ('22000000-0000-0000-0000-00000000000b', 'skinq', 'SkinQ', 0) on conflict do nothing;
select grant_plus('22000000-0000-0000-0000-00000000000b', 30, 'paid');
-- P hatched a lion (species 5), Q an egg that is not hatched yet.
insert into pets (id, user_id, species, egg, xp_seconds) values
  ('22000000-0000-0000-0000-0000000000a1', '22000000-0000-0000-0000-00000000000a', 5, 'normal', 30000),
  ('22000000-0000-0000-0000-0000000000b1', '22000000-0000-0000-0000-00000000000b', null, 'normal', 100);
update profiles set active_pet_id = '22000000-0000-0000-0000-0000000000a1' where id = '22000000-0000-0000-0000-00000000000a';
update profiles set active_pet_id = '22000000-0000-0000-0000-0000000000b1' where id = '22000000-0000-0000-0000-00000000000b';
do $$ begin
  if not exists (select 1 from pet_skins where user_id = '22000000-0000-0000-0000-00000000000a' and species = 5) then raise exception 'FAIL starting animal is not a skin'; end if;
end $$;
set role authenticated;
select pg_temp.as_user('22000000-0000-0000-0000-00000000000a');
select pg_temp.expect_fail($$insert into pet_skins (user_id, species) values (auth.uid(), 9)$$, 'cannot insert skins directly');
select pg_temp.expect_fail($$select set_skin(9)$$, 'skin not bought');
select pg_temp.expect_fail($$select set_skin(33)$$, 'Vainc+ skin without Vainc+');
select pg_temp.expect_fail($$select buy_skin(33)$$, 'Vainc+ skin cannot be bought');
select pg_temp.expect_fail($$select buy_skin(5)$$, 'already owned');
select buy_skin(9);
do $$ begin
  if (select spent_seconds from profiles where id = auth.uid()) <> 30 * 3600 then raise exception 'FAIL price is 30 h'; end if;
end $$;
select set_skin(9);
do $$ begin
  if (select species from pets where id = '22000000-0000-0000-0000-0000000000a1') <> 9 then raise exception 'FAIL skin not worn'; end if;
  if (select xp_seconds from pets where id = '22000000-0000-0000-0000-0000000000a1') <> 30000 then raise exception 'FAIL level lost'; end if;
  if (select count(*) from pet_skins where user_id = auth.uid()) <> 2 then raise exception 'FAIL both skins must be kept'; end if;
end $$;
select set_skin(5); -- back to the lion for free, both stay owned
select pg_temp.expect_fail($$select buy_skin(9)$$, 'already bought');
-- Not enough hours for a third skin: 100 h - 30 h = 70 h left, so buy two more then fail.
select buy_skin(10); select buy_skin(11);
select pg_temp.expect_fail($$select buy_skin(12)$$, 'not enough hours (10 h left)');
-- Q: Vainc+ animals are free, but the egg must hatch first.
select pg_temp.as_user('22000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail($$select set_skin(33)$$, 'egg not hatched');
reset role;
update pets set species = 2 where id = '22000000-0000-0000-0000-0000000000b1';
set role authenticated;
select set_skin(33);
do $$ begin
  if (select species from pets where id = '22000000-0000-0000-0000-0000000000b1') <> 33 then raise exception 'FAIL Vainc+ skin not worn'; end if;
  if exists (select 1 from pet_skins where user_id = auth.uid() and species = 33) then raise exception 'FAIL Vainc+ skin must not be stored'; end if;
end $$;
select pg_temp.expect_fail($$select set_skin(40)$$, 'unknown skin');
reset role;
delete from pets where id::text like '22000000-%';
delete from profiles where id::text like '22000000-%';
select 'V22 TESTS PASSED';
