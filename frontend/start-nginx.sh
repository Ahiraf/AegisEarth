#!/bin/sh
set -eu

if [ "$AEGISEARTH_API_UPSTREAM" != 'http://api:8000' ] &&
   ! printf '%s' "$AEGISEARTH_API_UPSTREAM" | grep -Eq '^https://[A-Za-z0-9.-]+$'; then
    printf '%s\n' 'Set AEGISEARTH_API_UPSTREAM to the HTTPS API origin without a trailing slash.' >&2
    exit 1
fi

envsubst '${AEGISEARTH_API_UPSTREAM}' </etc/nginx/aegisearth.conf.template >/tmp/aegisearth-nginx.conf
exec nginx -c /tmp/aegisearth-nginx.conf -g 'daemon off;'
