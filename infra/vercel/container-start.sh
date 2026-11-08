#!/bin/sh
set -eu
# Vercel provides AWS runtime credentials of its own. Prefer the existing,
# explicitly configured Neon/S3 credentials when present, for API and worker alike.
if [ -n "${AEGISEARTH_S3_ACCESS_KEY_ID:-}" ]; then
  : "${AEGISEARTH_S3_SECRET_ACCESS_KEY:?Missing configured S3 secret key}"
  unset AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
  export AWS_ACCESS_KEY_ID="$AEGISEARTH_S3_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$AEGISEARTH_S3_SECRET_ACCESS_KEY"
fi
export TMPDIR=/tmp
exec "$@"
