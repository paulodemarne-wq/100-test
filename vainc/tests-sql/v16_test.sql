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
-- Gabin (99) owns an exam, Fanny (ff) is his friend, A is not.
\set G '''99999999-0000-0000-0000-000000000099'''
\set F '''ffffffff-0000-0000-0000-00000000000f'''
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
select pg_temp.as_user(:G);
insert into exams (name, exam_date, goal_minutes) values ('Compta', current_date + 10, 1200) returning id as exam \gset
select pg_temp.as_user(:F);
select pg_temp.expect_rows($$select 1 from exams where name = 'Compta'$$, 0, 'not shared yet');
select pg_temp.as_user(:G);
select pg_temp.expect_fail($$select invite_to_exam('$$ || :'exam' || $$', 'aaaaaaaa-0000-0000-0000-000000000001')$$, 'only friends');
select pg_temp.expect_fail($$insert into exam_members (exam_id, user_id, status) values ('$$ || :'exam' || $$', 'ffffffff-0000-0000-0000-00000000000f', 'joined')$$, 'no direct insert');
select invite_to_exam(:'exam', :F);
select pg_temp.expect_fail($$select invite_to_exam('$$ || :'exam' || $$', 'ffffffff-0000-0000-0000-00000000000f')$$, 'no double invite');
select pg_temp.as_user(:F);
select pg_temp.expect_rows($$select 1 from exams where name = 'Compta'$$, 1, 'invited sees the exam');
select pg_temp.expect_rows($$select 1 from exam_ranking('$$ || :'exam' || $$')$$, 0, 'no ranking before joining');
update exams set goal_minutes = 1 where name = 'Compta';
select pg_temp.expect_rows($$select 1 from exams where name = 'Compta' and goal_minutes = 1200$$, 1, 'only owner edits');
update exam_members set status = 'joined' where exam_id = :'exam' and user_id = auth.uid();
insert into study_sessions (id, subject) values ('99999999-0000-0000-0000-000000000901', 'compta');
update study_sessions set status = 'done', duration_sec = 3600, ended_at = now() where id = '99999999-0000-0000-0000-000000000901';
select pg_temp.expect_rows($$select 1 from exam_ranking('$$ || :'exam' || $$')$$, 2, 'owner and member ranked');
select pg_temp.expect_rows($$select 1 from exam_ranking('$$ || :'exam' || $$') where user_id = 'ffffffff-0000-0000-0000-00000000000f' and seconds = 3600$$, 1, 'member hours counted');
select pg_temp.as_user(:A);
select pg_temp.expect_rows($$select 1 from exam_ranking('$$ || :'exam' || $$')$$, 0, 'outsider sees nothing');
select pg_temp.expect_rows($$select 1 from exam_members$$, 0, 'outsider sees no members');
select pg_temp.as_user(:F);
delete from exam_members where exam_id = :'exam' and user_id = auth.uid();
select pg_temp.expect_rows($$select 1 from exams where name = 'Compta'$$, 0, 'left the exam');
select 'V16 TESTS PASSED';
