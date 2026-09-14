#!/bin/sh
set -e
/usr/local/bin/selfhost-guard-env.sh
exec redis-server --requirepass "$REDIS_PASSWORD"
