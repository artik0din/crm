#!/bin/sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$ROOT/deploy/selfhost-guard-env.sh"

fail() {
	echo "guard test failed: $1" >&2
	exit 1
}

if POSTGRES_PASSWORD=CHANGE_ME REDIS_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaa "$GUARD" 2>/dev/null; then
	fail "CHANGE_ME must be rejected"
fi

if POSTGRES_PASSWORD=short REDIS_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaa "$GUARD" 2>/dev/null; then
	fail "short password must be rejected"
fi

if POSTGRES_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaa REDIS_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaa "$GUARD"; then
	exit 0
fi

fail "valid passwords must pass"
