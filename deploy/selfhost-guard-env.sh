#!/bin/sh
set -e

check_password() {
	name="$1"
	value="$2"
	if [ -z "$value" ] || [ "$value" = "CHANGE_ME" ] || [ "${#value}" -lt 24 ]; then
		echo "${name} must be set to a value other than CHANGE_ME and at least 24 characters." >&2
		exit 1
	fi
}

check_password POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
check_password REDIS_PASSWORD "$REDIS_PASSWORD"
