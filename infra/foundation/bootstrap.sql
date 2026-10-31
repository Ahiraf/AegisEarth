-- Disposable/local foundation only. Production roles/secrets are provisioned separately.
CREATE ROLE cosmic_anon NOLOGIN;
CREATE ROLE cosmic_api NOLOGIN;
CREATE ROLE cosmic_authenticator LOGIN PASSWORD 'local-foundation-only';
GRANT cosmic_anon, cosmic_api TO cosmic_authenticator;
