\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
grant usage on schema public to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
-- Like the app: insert ... returning (select().single()).
insert into vainc_events (title, starts_at) values ('bu', now() + interval '1 hour') returning id, host;
select 'V11 TESTS PASSED';
