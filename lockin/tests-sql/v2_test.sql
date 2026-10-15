\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
\set D '''dddddddd-0000-0000-0000-000000000004'''
insert into auth.users values (:D);
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
truncate net.calls;
set role authenticated;

select pg_temp.as_user(:D); insert into profiles (id, username, display_name) values (:D, 'dan', 'Dan');
select pg_temp.expect_rows($$select 1 from profiles where id = auth.uid() and weekly_goal_minutes = 600$$, 1, 'default weekly goal');
update profiles set weekly_goal_minutes = 900 where id = auth.uid();

-- push tokens
select pg_temp.as_user(:A); select public.register_push_token('ExponentPushToken[A]');
select pg_temp.as_user(:B); select public.register_push_token('ExponentPushToken[B]');
select pg_temp.as_user(:C); select public.register_push_token('ExponentPushToken[C]');
select pg_temp.as_user(:D); select public.register_push_token('ExponentPushToken[shared]');
select pg_temp.as_user(:C); select public.register_push_token('ExponentPushToken[shared]');
select pg_temp.expect_rows($$select 1 from push_tokens$$, 2, 'C sees only own tokens (incl. moved device)');
select pg_temp.expect_fail($$select public.send_push(array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[], 'spam', 'x')$$, 'clients cannot call send_push');

-- exams private
select pg_temp.as_user(:A); insert into exams (name, exam_date) values ('Partiel compta', current_date + 10);
select pg_temp.as_user(:B); select pg_temp.expect_rows($$select 1 from exams$$, 0, 'exams are private');
select pg_temp.expect_fail($$insert into exams (user_id, name, exam_date) values ('aaaaaaaa-0000-0000-0000-000000000001','x', current_date)$$, 'exam for someone else');

-- groups: A creates, C joins with code, D not member
select pg_temp.as_user(:A); insert into study_groups (name) values ('L3 Éco');
select pg_temp.expect_rows($$select 1 from group_members$$, 1, 'creator auto-joined');
reset role; select code as gcode, id as gid from study_groups \gset
set role authenticated;
select pg_temp.as_user(:C);
select pg_temp.expect_rows($$select 1 from study_groups$$, 0, 'non-member cannot list group');
select pg_temp.expect_fail(format('insert into group_members (group_id, user_id) values (%L, %L)', :'gid', 'cccccccc-0000-0000-0000-000000000003'), 'join without code');
select pg_temp.expect_fail($$select public.join_group('ZZZZZZ')$$, 'wrong code');
select public.join_group(lower(:'gcode'));
select pg_temp.expect_rows($$select 1 from group_members$$, 2, 'joined with code');
-- C (not friend of A) sees A's sessions through the group
select pg_temp.as_user(:A); insert into study_sessions (subject) values ('Compta');
select pg_temp.as_user(:C); select pg_temp.expect_rows($$select 1 from study_sessions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and subject = 'Compta'$$, 1, 'group member sees sessions');
select pg_temp.as_user(:D); select pg_temp.expect_rows($$select 1 from study_sessions$$, 0, 'outsider sees nothing');
select pg_temp.as_user(:C); delete from group_members where user_id = auth.uid();
select pg_temp.expect_rows($$select 1 from study_sessions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 0, 'left group, no more sessions');

-- events: A hosts, invites friend B, cannot invite non-friend D
select pg_temp.as_user(:A); insert into friendships (requester, addressee) values (:A, :B) on conflict do nothing;
select pg_temp.as_user(:B); update friendships set status = 'accepted' where addressee = auth.uid();
select pg_temp.as_user(:A);
insert into lockin_events (id, title, starts_at) values ('eeeeeeee-0000-0000-0000-000000000001', 'Révisions BU', now() + interval '2 hours');
insert into event_members (event_id, user_id, status) values ('eeeeeeee-0000-0000-0000-000000000001', :A, 'going');
insert into event_members (event_id, user_id) values ('eeeeeeee-0000-0000-0000-000000000001', :B);
select pg_temp.expect_fail($$insert into event_members (event_id, user_id) values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000004')$$, 'invite non-friend');
select pg_temp.as_user(:B);
select pg_temp.expect_rows($$select 1 from lockin_events$$, 1, 'invitee sees event');
select pg_temp.expect_fail($$insert into event_members (event_id, user_id) values ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003')$$, 'invitee cannot invite');
update event_members set status = 'going' where user_id = auth.uid();
select pg_temp.expect_fail($$update event_members set user_id = 'cccccccc-0000-0000-0000-000000000003' where user_id = auth.uid()$$, 'hijack invitation');
insert into study_sessions (subject, event_id) values ('Révisions BU', 'eeeeeeee-0000-0000-0000-000000000001');
select pg_temp.as_user(:D);
select pg_temp.expect_rows($$select 1 from lockin_events$$, 0, 'outsider cannot see event');
select pg_temp.expect_fail($$insert into study_sessions (subject, event_id) values ('x', 'eeeeeeee-0000-0000-0000-000000000001')$$, 'attach session to foreign event');
reset role;
select count(*) as push_calls, string_agg(body->0->>'title', ' | ' order by id) as titles from net.calls;
select 'V2 TESTS PASSED';
