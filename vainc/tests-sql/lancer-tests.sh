#!/bin/bash
# Runs every SQL test on a local Postgres 16 (port 5499), on a fresh database built from supabase/schema.sql
# (loaded twice to check it can be rerun), then checks supabase/mise-a-jour-tout.sql on an old schema (old0.sql).
# Usage (as root in the cloud container):  bash vainc/tests-sql/lancer-tests.sh
# pg_net is replaced by a stub; mock_supabase.sql fakes auth.uid(), roles and storage.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
D=/var/lib/postgresql/vainc-data
W=/var/lib/postgresql/vainc-work
mkdir -p $W
if [ ! -d $D ]; then su postgres -c "$BIN/initdb -D $D" >/dev/null; fi
su postgres -c "$BIN/pg_ctl -D $D status" >/dev/null 2>&1 || { su postgres -c "$BIN/pg_ctl -D $D -o '-p 5499 -k /var/run/postgresql' -l $D.log start" >/dev/null; sleep 2; }
cp $HERE/*.sql $REPO/supabase/mise-a-jour-tout.sql $W/
sed 's/^create extension if not exists pg_net.*$/create schema if not exists net; create or replace function net.http_post(url text, body jsonb default null, params jsonb default null, headers jsonb default null, timeout_milliseconds int default 1000) returns bigint language sql as $x$ select 1::bigint $x$;/' $REPO/supabase/schema.sql > $W/schema.sql
chown -R postgres $W
P="psql -h /var/run/postgresql -p 5499 -U postgres -v ON_ERROR_STOP=1 -q"
# v12_test is superseded by v13_test (same setup, they cannot run on the same database).
TESTS="rls_test rls_test2 v2_test v3_test v4_test v5_test v6_test v7_test admin_run v8_test v9_test v10_test v11_test v13_test v14_test v15_test v16_test v17_test v18_test v19_test v20_test v21_test"
set +e
echo "== Base neuve (schema.sql x2)"
su postgres -c "dropdb -h /var/run/postgresql -p 5499 --if-exists lt; createdb -h /var/run/postgresql -p 5499 lt"
su postgres -c "$P -d lt -f $W/mock_supabase.sql -f $W/schema.sql -f $W/schema.sql" 2>&1 | grep ERROR
for f in $TESTS; do
  printf "%s: " $f; su postgres -c "$P -d lt -f $W/$f.sql" 2>&1 | grep -E "PASSED|FAIL|ERROR" | head -2 | tr '\n' ' '; echo
done
echo "== Ancienne base + mise-a-jour-tout.sql x2"
su postgres -c "dropdb -h /var/run/postgresql -p 5499 --if-exists lu; createdb -h /var/run/postgresql -p 5499 lu"
su postgres -c "$P -d lu -f $W/mock_supabase.sql -f $W/old0.sql" 2>&1 | grep ERROR
su postgres -c "$P -d lu -f $W/mise-a-jour-tout.sql -f $W/mise-a-jour-tout.sql" 2>&1 | grep ERROR
for f in $TESTS; do
  su postgres -c "$P -d lu -f $W/$f.sql" 2>&1 | grep -E "PASSED|FAIL|ERROR" | head -2 | tr '\n' ' '
done; echo
