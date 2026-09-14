#!/bin/sh
set -e
/usr/local/bin/selfhost-guard-env.sh
exec /usr/local/bin/docker-entrypoint.sh postgres "$@"
