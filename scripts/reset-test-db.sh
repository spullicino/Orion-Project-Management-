#!/usr/bin/env bash
# Recreates an empty database for the RLS tests on a plain local Postgres.
# Usage: scripts/reset-test-db.sh postgresql://postgres@127.0.0.1:5432  orion_test
set -euo pipefail
SERVER_URL="${1:-postgresql://postgres@127.0.0.1:5432}"
DB="${2:-orion_test}"
psql "$SERVER_URL/postgres" -q -c "drop database if exists $DB" -c "create database $DB"
echo "Fresh database ready: $SERVER_URL/$DB"
