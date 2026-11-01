CREATE FUNCTION gateway.release_refresh_claim(p_hash text,p_cooldown int) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE saved public.release_refresh_checks; token text;
BEGIN
 PERFORM pg_advisory_xact_lock(73624108);
 IF p_hash !~ '^[0-9a-f]{64}$' OR p_cooldown NOT BETWEEN 60 AND 86400 THEN
 RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_refresh'; END IF;
 SELECT * INTO saved FROM public.release_refresh_checks WHERE query_hash=p_hash FOR UPDATE;
 IF FOUND AND (saved.lease_until>statement_timestamp() OR saved.attempted_at>statement_timestamp()-make_interval(secs=>p_cooldown)) THEN
 RETURN jsonb_build_object('claimed',false,'payload',saved.payload); END IF;
 token:=gen_random_uuid()::text;
 INSERT INTO public.release_refresh_checks(query_hash,lease_token,attempted_at,lease_until,payload)
 VALUES(p_hash,token,statement_timestamp(),statement_timestamp()+interval '5 minutes',jsonb_build_object('status','checking'))
 ON CONFLICT(query_hash) DO UPDATE SET lease_token=excluded.lease_token,attempted_at=excluded.attempted_at,
 lease_until=excluded.lease_until,payload=excluded.payload;
 RETURN jsonb_build_object('claimed',true,'token',token);
END $$;
CREATE FUNCTION gateway.release_refresh_finish(p_hash text,p_token text,p_report jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF octet_length(p_report::text)>65536 THEN RAISE SQLSTATE 'PT422' USING MESSAGE='refresh_report_limit'; END IF;
 UPDATE public.release_refresh_checks SET payload=p_report,lease_until=statement_timestamp()
 WHERE query_hash=p_hash AND lease_token=p_token AND lease_until>statement_timestamp();
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='refresh_lease_lost'; END IF;
 RETURN p_report;
END $$;
CREATE FUNCTION gateway.release_refresh_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(p),'[]'::jsonb) FROM (
 SELECT jsonb_build_object('query_hash',query_hash,'attempted_at_utc',attempted_at,'report',payload) p
 FROM public.release_refresh_checks ORDER BY attempted_at DESC,query_hash LIMIT 10) t;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gateway FROM PUBLIC;
