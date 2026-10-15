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
-- admin.sql was run as postgres for A ('alice') before this test.
select pg_temp.as_user(:A);
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and featured and (world->>'size')::int = 32$$, 1, 'A is featured with a 32x32 island');
select pg_temp.expect_rows($$select 1 from pets where user_id = auth.uid() and xp_seconds >= 2190*3600$$, 10, 'A has 10 maxed Vainc+ animals');
select pg_temp.expect_fail($$update profiles set featured = true where id = auth.uid()$$, 'cannot self-feature');
select public.save_world(jsonb_build_object('size', 32, 'sea', true, 'tiles', repeat('g', 1024), 'objects', '[["boutique",5,5,0]]'::jsonb));
-- E (not friends with A) sees A's pets.
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
select pg_temp.expect_rows($$select 1 from pets where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 11, 'stranger sees featured pets (10 animals + first egg)');
select pg_temp.expect_rows($$select 1 from pets where user_id = 'cccccccc-0000-0000-0000-000000000003'$$, 0, 'stranger still cannot see normal pets');
select pg_temp.expect_fail($$select public.save_world(jsonb_build_object('size', 16, 'tiles', repeat('g', 256), 'objects', '[["boutique",5,5,0]]'::jsonb))$$, 'others cannot place the shop building');
-- Daily shop: 7 items (6 deals + 1 gift), the same for everyone.
select pg_temp.expect_rows($$select 1 from todays_deals()$$, 7, 'daily shop has 7 items');
select pg_temp.expect_rows($$select 1 from todays_deals() where percent = 100$$, 1, 'one gift');
select pg_temp.expect_rows($$select 1 from todays_deals() where percent between 30 and 75$$, 6, 'six deals between -30 and -75');
select pg_temp.expect_fail($$select public.purchase('castle', 0)$$, 'purchase not callable directly');
select pg_temp.expect_fail($$select public.buy_item('boutique')$$, 'shop building not for sale');
select pg_temp.expect_fail($$select public.buy_deal('boutique')$$, 'not in today''s shop');
-- 600 h more for E.
do $$ begin for i in 40..99 loop
  insert into study_sessions (id, subject) values (('99999999-0000-0000-0000-0000000000' || i)::uuid, 'x');
  update study_sessions set status = 'done', duration_sec = 36000, ended_at = now() where id = ('99999999-0000-0000-0000-0000000000' || i)::uuid;
end loop; end $$;
-- Buying a deal costs exactly the discounted price; the gift is free and only once.
do $$
declare d record; before int; cost int; owned boolean; egg boolean;
begin
  for d in select * from todays_deals() loop
    -- Eggs and island objects can be bought again; only the rest is once.
    select cost_seconds, kind = 'egg' or (kind = 'garden' and slot <> 'ground') into cost, egg from shop_items where id = d.item_id;
    owned := exists (select 1 from inventory where user_id = auth.uid() and item_id = d.item_id);
    continue when owned;
    -- Sizes need the previous one: skip what can't be bought.
    continue when d.item_id in ('size24', 'size28', 'size32');
    before := (select spent_seconds from profiles where id = auth.uid());
    perform public.buy_deal(d.item_id);
    if (select spent_seconds from profiles where id = auth.uid()) - before <> cost * (100 - d.percent) / 100 then
      raise exception 'FAIL: wrong price for %', d.item_id;
    end if;
    if not egg and d.percent < 100 then
      begin
        perform public.buy_deal(d.item_id);
        raise exception 'FAIL: bought % twice', d.item_id;
      exception when others then
        if sqlerrm like 'FAIL%' then raise; end if;
      end;
    end if;
  end loop;
  raise notice 'OK deals bought at the right price';
end $$;
select 'V8 TESTS PASSED';
