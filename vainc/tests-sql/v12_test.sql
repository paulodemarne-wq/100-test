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
select 'V12 TESTS PASSED';
