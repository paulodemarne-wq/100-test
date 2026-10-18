\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
-- Old pets (before v21): put them back to old species numbers, as if not converted yet.
reset role;
alter table pets drop constraint if exists pets_species_check;
insert into pets (id, user_id, species, egg, xp_seconds, species_v) values
  ('21000000-0000-0000-0000-000000000001', :A, 45, 'normal', 30000, 1),
  ('21000000-0000-0000-0000-000000000002', :A, 103, 'plus', 30000, 1),
  ('21000000-0000-0000-0000-000000000003', :A, 7, 'normal', 30000, 1),
  ('21000000-0000-0000-0000-000000000004', :A, null, 'plus', 0, 1),
  ('21000000-0000-0000-0000-000000000005', :A, null, 'normal', 0, 1);
\i /var/lib/postgresql/vainc-work/mise-a-jour-animaux.sql
\i /var/lib/postgresql/vainc-work/mise-a-jour-animaux.sql
do $$
begin
  if (select species from pets where id = '21000000-0000-0000-0000-000000000001') <> 15 then raise exception 'FAIL 45 -> 15'; end if;
  if (select species from pets where id = '21000000-0000-0000-0000-000000000002') <> 33 then raise exception 'FAIL 103 -> 33'; end if;
  if (select species from pets where id = '21000000-0000-0000-0000-000000000003') <> 7 then raise exception 'FAIL 7 stays'; end if;
  update pets set xp_seconds = 20000 where id in ('21000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000005');
  perform hatch_if_ready('21000000-0000-0000-0000-000000000004');
  perform hatch_if_ready('21000000-0000-0000-0000-000000000005');
  if (select species from pets where id = '21000000-0000-0000-0000-000000000004') not between 30 and 39 then raise exception 'FAIL plus egg'; end if;
  if (select species from pets where id = '21000000-0000-0000-0000-000000000005') not between 0 and 29 then raise exception 'FAIL normal egg'; end if;
  begin
    update pets set species = 45 where id = '21000000-0000-0000-0000-000000000003';
    raise exception 'FAIL species 45 accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from pets where species_v is distinct from 2) then raise exception 'FAIL species_v'; end if;
end $$;
delete from pets where id::text like '21000000-%';
select 'V21 TESTS PASSED';
