-- All public admission counters and worker capacity decisions serialize in PostgreSQL.
CREATE FUNCTION gateway.view_replay(p_scope text,p_key text,p_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE saved public.view_submissions;
BEGIN
 SELECT * INTO saved FROM public.view_submissions WHERE scope=p_scope AND key_hash=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF saved.request_hash<>p_hash THEN RAISE SQLSTATE 'PT409' USING MESSAGE='idempotency_conflict'; END IF;
 RETURN jsonb_build_object('id',saved.view_id,'created',false,
 'owner',(SELECT owner_scope=p_scope FROM public.sky_views WHERE id=saved.view_id));
END $$;

CREATE FUNCTION gateway.view_preflight(p_scope text,p_ip text,p_policy jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (SELECT count(*) FROM public.view_submissions WHERE scope=p_scope AND created_at>statement_timestamp()-interval '1 hour') >= (p_policy->>'client_hour')::int
 OR (SELECT count(*) FROM public.view_submissions WHERE ip_hash=p_ip AND created_at>statement_timestamp()-interval '1 hour') >= (p_policy->>'ip_hour')::int THEN
   RAISE SQLSTATE 'PT429' USING MESSAGE='hourly_quota';
 END IF;
 RETURN jsonb_build_object('allowed',true);
END $$;

CREATE FUNCTION gateway.view_get(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',v.id,'status',j.status,'attempt',j.attempt,
 'created_at_utc',j.created_at,'deadline_at_utc',j.deadline_at,'expires_at_utc',v.expires_at,
 'snapshot_id',v.snapshot_id,'canonical_request',v.canonical,'result',j.result,
 'error_code',j.error_code,'viewer_execution_available',false,
 'artifacts',coalesce((SELECT jsonb_agg(f.payload::jsonb-'storage_key' ORDER BY f.id)
 FROM public.view_files f WHERE f.view_id=v.id AND f.published AND NOT f.storage_deleted
 AND j.status='succeeded' AND v.expires_at>statement_timestamp()),'[]'::jsonb))
 FROM public.sky_views v JOIN public.processing_jobs j ON j.id=v.id WHERE v.id=p_id;
$$;

CREATE FUNCTION gateway.view_submit(p_id text,p_scope text,p_ip text,p_key text,p_hash text,
 p_digest text,p_cache text,p_snapshot text,p_canonical jsonb,p_products jsonb,p_policy jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE existing public.view_submissions; chosen text; created boolean:=false;
BEGIN
 PERFORM pg_advisory_xact_lock(73624103);
 IF p_scope !~ '^[0-9a-f]{64}$' OR p_ip !~ '^[0-9a-f]{64}$' OR p_key !~ '^[0-9a-f]{64}$'
 OR p_hash !~ '^[0-9a-f]{64}$' OR p_digest !~ '^[0-9a-f]{64}$'
 OR jsonb_typeof(p_products) IS DISTINCT FROM 'array' OR jsonb_array_length(p_products)>12
 OR octet_length(p_canonical::text)>16384 OR octet_length(p_products::text)>49152 THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_view';
 END IF;
 SELECT * INTO existing FROM public.view_submissions WHERE scope=p_scope AND key_hash=p_key;
 IF FOUND THEN
   IF existing.request_hash<>p_hash THEN
     RAISE SQLSTATE 'PT409' USING MESSAGE='idempotency_conflict';
   END IF;
   RETURN jsonb_build_object('id',existing.view_id,'created',false,
     'owner',(SELECT owner_scope=p_scope FROM public.sky_views WHERE id=existing.view_id));
 END IF;
 UPDATE public.processing_jobs j SET status='failed',error_code='deadline_exceeded',
 lease_token=NULL,lease_expires_at=NULL FROM public.sky_views v
 WHERE j.id=v.id AND j.status IN ('queued','running') AND j.deadline_at<=statement_timestamp();
 IF (SELECT count(*) FROM public.view_submissions WHERE scope=p_scope AND created_at>statement_timestamp()-interval '1 hour') >= (p_policy->>'client_hour')::int
 OR (SELECT count(*) FROM public.view_submissions WHERE ip_hash=p_ip AND created_at>statement_timestamp()-interval '1 hour') >= (p_policy->>'ip_hour')::int THEN
   RAISE SQLSTATE 'PT429' USING MESSAGE='hourly_quota';
 END IF;
 SELECT v.id INTO chosen FROM public.sky_views v JOIN public.processing_jobs j ON j.id=v.id
 WHERE v.cache_key=p_cache AND j.status='succeeded' AND v.expires_at>statement_timestamp()
 ORDER BY j.created_at DESC,v.id DESC LIMIT 1;
 IF chosen IS NULL THEN
   IF (SELECT count(*) FROM public.sky_views v JOIN public.processing_jobs j ON j.id=v.id
       WHERE v.owner_scope=p_scope AND j.status IN ('queued','running')) >= (p_policy->>'client_active')::int
   OR (SELECT count(*) FROM public.sky_views v JOIN public.processing_jobs j ON j.id=v.id
       WHERE j.status IN ('queued','running')) >= (p_policy->>'queue')::int THEN
     RAISE SQLSTATE 'PT429' USING MESSAGE='queue_quota';
   END IF;
   chosen:=p_id; created:=true;
   INSERT INTO public.processing_jobs(id,scope,idempotency_key,request_hash,kind,config,status,attempt,max_attempts,deadline_at)
   VALUES(p_id,p_scope,p_id,p_hash,'view',jsonb_build_object('products',p_products,
    'region',p_canonical->'region','limits',p_policy),'queued',0,3,statement_timestamp()+interval '15 minutes');
   INSERT INTO public.sky_views(id,snapshot_id,owner_scope,cancel_digest,cache_key,canonical)
   VALUES(p_id,p_snapshot,p_scope,p_digest,p_cache,p_canonical);
 END IF;
 INSERT INTO public.view_submissions(id,scope,ip_hash,key_hash,request_hash,view_id)
 VALUES(gen_random_uuid()::text,p_scope,p_ip,p_key,p_hash,chosen);
 RETURN jsonb_build_object('id',chosen,'created',created,
   'owner',(SELECT owner_scope=p_scope FROM public.sky_views WHERE id=chosen));
END $$;

CREATE FUNCTION gateway.view_cancel(p_id text,p_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sky_views WHERE id=p_id AND cancel_digest=p_digest) THEN
   RETURN NULL;
 END IF;
 UPDATE public.processing_jobs SET status='canceled',lease_token=NULL,lease_expires_at=NULL
 WHERE id=p_id AND status IN ('queued','running');
 RETURN gateway.view_get(p_id);
END $$;

CREATE FUNCTION gateway.view_artifact(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT f.payload::jsonb FROM public.view_files f JOIN public.sky_views v ON v.id=f.view_id
 JOIN public.processing_jobs j ON j.id=v.id WHERE f.id=p_id AND f.published AND NOT f.storage_deleted
 AND v.expires_at>statement_timestamp() AND j.status='succeeded';
$$;

CREATE FUNCTION gateway.claim_view_job(p_worker text,p_capacity int) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE chosen text; job public.processing_jobs;
BEGIN
 PERFORM pg_advisory_xact_lock(73624104);
 IF p_capacity NOT BETWEEN 1 AND 4 OR length(p_worker) NOT BETWEEN 1 AND 128 THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_worker';
 END IF;
 UPDATE public.processing_jobs j SET status='failed',error_code='deadline_or_attempts_exhausted',
 lease_token=NULL,lease_expires_at=NULL FROM public.sky_views v WHERE v.id=j.id
 AND j.status IN ('queued','running') AND (j.deadline_at<=statement_timestamp()
 OR (j.status='running' AND j.lease_expires_at<=statement_timestamp() AND j.attempt>=j.max_attempts));
 IF (SELECT count(*) FROM public.processing_jobs j JOIN public.sky_views v ON v.id=j.id
 WHERE j.status='running' AND j.lease_expires_at>statement_timestamp())>=p_capacity THEN RETURN NULL; END IF;
 SELECT j.id INTO chosen FROM public.processing_jobs j JOIN public.sky_views v ON v.id=j.id
 WHERE (j.status='queued' OR (j.status='running' AND j.lease_expires_at<=statement_timestamp()))
 AND j.deadline_at>statement_timestamp() AND j.attempt<j.max_attempts AND v.retry_after_at<=statement_timestamp()
 ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF chosen IS NULL THEN RETURN NULL; END IF;
 UPDATE public.processing_jobs SET status='running',worker_id=p_worker,lease_token=gen_random_uuid()::text,
 lease_expires_at=least(deadline_at,statement_timestamp()+interval '120 seconds'),attempt=attempt+1
 WHERE id=chosen RETURNING * INTO job;
 RETURN to_jsonb(job)||jsonb_build_object('pins',coalesce((SELECT jsonb_object_agg(product_id,sha256)
 FROM public.view_input_pins WHERE view_id=chosen),'{}'::jsonb));
END $$;

CREATE FUNCTION gateway.view_heartbeat(p_id text,p_token text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT to_jsonb(r) FROM gateway.heartbeat_job(p_id,p_token,120) r;
$$;

CREATE FUNCTION gateway.view_pin(p_id text,p_token text,p_product text,p_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM id FROM public.processing_jobs WHERE id=p_id AND status='running' AND lease_token=p_token
 AND lease_expires_at>statement_timestamp() AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 IF p_sha !~ '^[0-9a-f]{64}$' OR NOT EXISTS(SELECT 1 FROM public.processing_jobs j,
 jsonb_array_elements(j.config->'products') p WHERE j.id=p_id AND p->>'id'=p_product) THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_input_pin';
 END IF;
 INSERT INTO public.view_input_pins(view_id,product_id,sha256) VALUES(p_id,p_product,p_sha)
 ON CONFLICT(view_id,product_id) DO NOTHING;
 IF (SELECT sha256 FROM public.view_input_pins WHERE view_id=p_id AND product_id=p_product)<>p_sha THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE='source_changed';
 END IF;
 RETURN jsonb_build_object('pinned',true);
END $$;

CREATE FUNCTION gateway.view_prepare_upload(p_id text,p_token text,p_file jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM id FROM public.processing_jobs WHERE id=p_id AND status='running' AND lease_token=p_token
 AND lease_expires_at>statement_timestamp() AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 IF p_file->>'storage_key'<>('objects/'||p_id||'/'||p_token||'/'||(p_file->>'sha256')||'.fits')
 OR NOT EXISTS(SELECT 1 FROM public.view_input_pins WHERE view_id=p_id AND product_id=p_file->>'product_id'
 AND sha256=p_file->>'sha256') THEN RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_upload'; END IF;
 INSERT INTO public.view_files(id,view_id,product_id,payload,storage_deleted,published)
 VALUES(p_file->>'id',p_id,p_file->>'product_id',p_file,false,false);
 RETURN jsonb_build_object('prepared',true);
END $$;

CREATE FUNCTION gateway.complete_view(p_id text,p_token text,p_files jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE job public.processing_jobs; item jsonb; total bigint:=0; expected int;
BEGIN
 SELECT * INTO job FROM public.processing_jobs WHERE id=p_id AND status='running' AND lease_token=p_token
 AND lease_expires_at>statement_timestamp() AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 expected:=jsonb_array_length(job.config->'products');
 IF jsonb_typeof(p_files) IS DISTINCT FROM 'array' OR jsonb_array_length(p_files)<>expected
 OR expected>12 OR octet_length(p_files::text)>65536 THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_completion';
 END IF;
 IF (SELECT count(DISTINCT f->>'product_id') FROM jsonb_array_elements(p_files) f)<>expected THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='duplicate_input';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_files) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.view_input_pins WHERE view_id=p_id
     AND product_id=item->>'product_id' AND sha256=item->>'sha256')
   OR item->>'storage_key'<>('objects/'||p_id||'/'||p_token||'/'||(item->>'sha256')||'.fits')
   OR (item->>'size_bytes')::bigint NOT BETWEEN 1 AND 134217728 THEN
     RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_artifact';
   END IF;
   total:=total+(item->>'size_bytes')::bigint;
   UPDATE public.view_files SET published=true WHERE id=item->>'id' AND view_id=p_id
     AND payload::jsonb=item AND NOT storage_deleted AND NOT published;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='upload_not_prepared'; END IF;
 END LOOP;
 IF total>(job.config->'limits'->>'total_bytes')::bigint THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='total_bytes_exceeded';
 END IF;
 UPDATE public.sky_views SET expires_at=statement_timestamp()+interval '24 hours' WHERE id=p_id;
 UPDATE public.processing_jobs SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,
 result=jsonb_build_object('stage','inputs_ready','input_count',expected,'total_bytes',total,
 'viewer_execution_available',false),error_code=NULL WHERE id=p_id;
 RETURN gateway.view_get(p_id);
END $$;

CREATE FUNCTION gateway.fail_view(p_id text,p_token text,p_code text,p_retry boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE job public.processing_jobs;
BEGIN
 SELECT * INTO job FROM public.processing_jobs WHERE id=p_id AND status='running' AND lease_token=p_token
 AND lease_expires_at>statement_timestamp() AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 UPDATE public.processing_jobs SET status=CASE WHEN p_retry AND attempt<max_attempts THEN 'queued' ELSE 'failed' END,
 error_code=left(p_code,64),lease_token=NULL,lease_expires_at=NULL WHERE id=p_id;
 UPDATE public.sky_views SET retry_after_at=statement_timestamp()+make_interval(secs=>5*job.attempt) WHERE id=p_id;
 RETURN gateway.view_get(p_id);
END $$;

CREATE OR REPLACE FUNCTION gateway.readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM id FROM public.sky_views LIMIT 1;
 PERFORM id FROM public.view_files LIMIT 1;
 IF NOT EXISTS(SELECT 1 FROM public.alembic_version WHERE version_num='cosmic_0004') THEN RAISE EXCEPTION 'schema_not_ready'; END IF;
 RETURN jsonb_build_object('status','ready','schema_revision','cosmic_0004');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gateway FROM PUBLIC;
