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
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
insert into todos (title, hours, due_date) values ('Chapitre 3', 10, current_date + 10) returning id \gset t_
select pg_temp.expect_fail($$update todos set worked_seconds = 999999$$, 'cannot fake worked time');
select pg_temp.expect_fail($$insert into todos (title, hours, due_date, user_id) values ('x', 1, current_date, 'cccccccc-0000-0000-0000-000000000003')$$, 'cannot create for someone else');
insert into study_sessions (id, subject, todo_id) values ('99999999-0000-0000-0000-000000000777', 'Chapitre 3', :'t_id');
update study_sessions set status = 'done', duration_sec = 5400, ended_at = now() where id = '99999999-0000-0000-0000-000000000777';
select pg_temp.expect_rows($$select 1 from todos where title = 'Chapitre 3' and worked_seconds = 5400$$, 1, 'session time added to the to-do');
update todos set done_at = now() where title = 'Chapitre 3';
select pg_temp.as_user(:C);
select pg_temp.expect_rows($$select 1 from todos$$, 0, 'to-dos are private');
-- C cannot attach a session to E's to-do.
insert into study_sessions (id, subject, todo_id) values ('99999999-0000-0000-0000-000000000778', 'x', :'t_id');
select pg_temp.expect_rows($$select 1 from study_sessions where id = '99999999-0000-0000-0000-000000000778' and todo_id is null$$, 1, 'foreign to-do ignored');
-- v13: switching to-dos during one vainc.
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
insert into todos (title, hours, due_date) values ('Maths', 4, current_date + 3) returning id \gset m_
insert into todos (title, hours, due_date) values ('Français', 4, current_date + 3) returning id \gset f_
insert into study_sessions (id, subject, todo_id) values ('99999999-0000-0000-0000-000000000779', 'DS', :'m_id');
update study_sessions set todo_split = jsonb_build_object(:'m_id', 1200, :'f_id', 600, 'not-a-uuid', 5)
  where id = '99999999-0000-0000-0000-000000000779';
update study_sessions set status = 'done', duration_sec = 2400, ended_at = now() where id = '99999999-0000-0000-0000-000000000779';
select pg_temp.expect_rows($$select 1 from todos where title = 'Maths' and worked_seconds = 1200$$, 1, 'maths part');
select pg_temp.expect_rows($$select 1 from todos where title = 'Français' and worked_seconds = 600$$, 1, 'français part');
-- Announcing more than the session lasted: shrunk to the session length.
insert into study_sessions (id, subject) values ('99999999-0000-0000-0000-000000000781', 'x');
update study_sessions set todo_split = jsonb_build_object(:'t_id', 99999999999) where id = '99999999-0000-0000-0000-000000000781';
update study_sessions set status = 'done', duration_sec = 300, ended_at = now() where id = '99999999-0000-0000-0000-000000000781';
select pg_temp.expect_rows($$select 1 from todos where title = 'Chapitre 3' and worked_seconds = 5400 + 300$$, 1, 'huge part capped at the session length');
select pg_temp.expect_fail($$update study_sessions set todo_split = '[1]' where id = '99999999-0000-0000-0000-000000000779'$$, 'split must be an object');
-- Someone else's to-do in the split is ignored.
select pg_temp.as_user(:C);
insert into study_sessions (id, subject, todo_split) values ('99999999-0000-0000-0000-000000000780', 'x', jsonb_build_object(:'m_id', 100));
update study_sessions set status = 'done', duration_sec = 100, ended_at = now() where id = '99999999-0000-0000-0000-000000000780';
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');
select pg_temp.expect_rows($$select 1 from todos where title = 'Maths' and worked_seconds = 1200$$, 1, 'foreign split ignored');
select 'V13 TESTS PASSED';
