CREATE FUNCTION gateway.movie_lookup(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('sha256',m.sha256,'payload',m.payload::jsonb)
 FROM public.movie_manifests m JOIN public.sky_views v ON v.id=m.view_id
 JOIN public.processing_jobs j ON j.id=v.id
 WHERE v.id=p_id AND j.status='succeeded' AND v.expires_at>statement_timestamp();
$$;

CREATE FUNCTION gateway.movie_publish(p_id text,p_report jsonb,p_payload jsonb,p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM v.id FROM public.sky_views v JOIN public.processing_jobs j ON j.id=v.id
 JOIN public.prepared_frame_sets s ON s.view_id=v.id
 WHERE v.id=p_id AND j.status='succeeded' AND v.expires_at>statement_timestamp()
 AND s.report::jsonb=p_report;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='movie_source_unavailable'; END IF;
 IF p_payload->>'view_id' IS DISTINCT FROM p_id OR p_payload->>'manifest_version' IS DISTINCT FROM 'movie-v1'
 OR octet_length(p_payload::text)>512000 OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_movie';
 END IF;
 -- First publication wins. Frozen sources and manifests are never updated by a read.
 INSERT INTO public.movie_manifests(view_id,sha256,payload) VALUES(p_id,p_sha256,p_payload)
 ON CONFLICT(view_id) DO NOTHING;
 RETURN gateway.movie_lookup(p_id);
END $$;

CREATE OR REPLACE FUNCTION gateway.readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM view_id FROM public.movie_manifests LIMIT 1;
 IF NOT EXISTS(SELECT 1 FROM public.alembic_version WHERE version_num='cosmic_0006') THEN RAISE EXCEPTION 'schema_not_ready'; END IF;
 RETURN jsonb_build_object('status','ready','schema_revision','cosmic_0006');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gateway FROM PUBLIC;
