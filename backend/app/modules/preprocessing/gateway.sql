CREATE FUNCTION gateway.prepare_frame_upload(p_id text,p_token text,p_file jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE job public.processing_jobs; extension text;
BEGIN
 SELECT * INTO job FROM public.processing_jobs WHERE id=p_id AND status='running' AND lease_token=p_token
 AND lease_expires_at>statement_timestamp() AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 extension:=CASE p_file->>'content_type' WHEN 'image/png' THEN 'png' WHEN 'application/fits' THEN 'fits'
   WHEN 'application/json' THEN 'json' ELSE NULL END;
 IF extension IS NULL OR (p_file->>'sha256') IS NULL OR (p_file->>'sha256') !~ '^[0-9a-f]{64}$'
 OR (p_file->>'size_bytes')::bigint NOT BETWEEN 1 AND 134217728
 OR p_file->>'storage_key'<>('objects/'||p_id||'/'||p_token||'/'||(p_file->>'sha256')||'.'||extension)
 OR jsonb_typeof(p_file->'source_product_ids') IS DISTINCT FROM 'array'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_file->'source_product_ids') s
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(job.config->'products') p WHERE p->>'id'=s)) THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_prepared_artifact';
 END IF;
 IF (SELECT count(*) FROM public.prepared_artifacts WHERE view_id=p_id)>=192 THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='prepared_artifact_limit';
 END IF;
 INSERT INTO public.prepared_artifacts(id,view_id,payload,published,storage_deleted)
 VALUES(p_file->>'id',p_id,p_file,false,false);
 RETURN jsonb_build_object('prepared',true);
END $$;

CREATE FUNCTION gateway.complete_prepared_view(p_id text,p_token text,p_files jsonb,p_derived jsonb,p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; total bigint:=0; job public.processing_jobs;
BEGIN
 SELECT * INTO job FROM public.processing_jobs WHERE id=p_id AND status='running' AND lease_token=p_token
 AND lease_expires_at>statement_timestamp() AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' OR octet_length(p_report::text)>512000
 OR jsonb_typeof(p_derived) IS DISTINCT FROM 'array' OR jsonb_array_length(p_derived)>64
 OR octet_length(p_derived::text)>131072 THEN RAISE SQLSTATE 'PT422' USING MESSAGE='prepared_report_limit'; END IF;
 -- Legacy raw input publication participates in this same transaction; failure rolls it all back.
 PERFORM gateway.complete_view(p_id,p_token,p_files);
 FOR item IN SELECT value FROM jsonb_array_elements(p_derived) LOOP
   UPDATE public.prepared_artifacts SET published=true WHERE id=item->>'id' AND view_id=p_id
   AND payload::jsonb=item AND NOT storage_deleted AND NOT published;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='prepared_upload_missing'; END IF;
   total:=total+(item->>'size_bytes')::bigint;
 END LOOP;
 total:=total+(SELECT coalesce(sum((f->>'size_bytes')::bigint),0) FROM jsonb_array_elements(p_files) f);
 IF total>(job.config->'limits'->>'total_bytes')::bigint THEN RAISE SQLSTATE 'PT422' USING MESSAGE='prepared_total_bytes_exceeded'; END IF;
 INSERT INTO public.prepared_frame_sets(view_id,report) VALUES(p_id,p_report);
 UPDATE public.processing_jobs SET result=result||jsonb_build_object('stage','frames_prepared',
   'preparation_url','/api/v1/views/'||p_id||'/preparation','prepared_artifact_count',jsonb_array_length(p_derived),
   'total_bytes',total) WHERE id=p_id;
 RETURN gateway.view_get(p_id);
END $$;

CREATE FUNCTION gateway.frame_set_get(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT s.report::jsonb FROM public.prepared_frame_sets s JOIN public.sky_views v ON v.id=s.view_id
 JOIN public.processing_jobs j ON j.id=v.id WHERE v.id=p_id AND j.status='succeeded' AND v.expires_at>statement_timestamp();
$$;

CREATE OR REPLACE FUNCTION gateway.view_artifact(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT f.payload::jsonb FROM public.view_files f JOIN public.sky_views v ON v.id=f.view_id
 JOIN public.processing_jobs j ON j.id=v.id WHERE f.id=p_id AND f.published AND NOT f.storage_deleted
 AND v.expires_at>statement_timestamp() AND j.status='succeeded'
 UNION ALL
 SELECT f.payload::jsonb FROM public.prepared_artifacts f JOIN public.sky_views v ON v.id=f.view_id
 JOIN public.processing_jobs j ON j.id=v.id WHERE f.id=p_id AND f.published AND NOT f.storage_deleted
 AND v.expires_at>statement_timestamp() AND j.status='succeeded';
$$;

CREATE OR REPLACE FUNCTION gateway.readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM view_id FROM public.prepared_frame_sets LIMIT 1;
 IF NOT EXISTS(SELECT 1 FROM public.alembic_version WHERE version_num='cosmic_0005') THEN RAISE EXCEPTION 'schema_not_ready'; END IF;
 RETURN jsonb_build_object('status','ready','schema_revision','cosmic_0005');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gateway FROM PUBLIC;
