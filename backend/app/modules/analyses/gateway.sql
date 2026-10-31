-- PostgreSQL-only foundation RPCs. SECURITY INVOKER and a restricted exposed schema.
CREATE SCHEMA IF NOT EXISTS gateway;
REVOKE ALL ON SCHEMA gateway FROM PUBLIC;

CREATE FUNCTION gateway.readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM id FROM public.observations LIMIT 1;
  PERFORM id FROM public.processing_jobs LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM public.alembic_version WHERE version_num='cosmic_0002') THEN
    RAISE EXCEPTION 'schema_not_ready';
  END IF;
  RETURN jsonb_build_object('status','ready','schema_revision','cosmic_0002');
END $$;

CREATE FUNCTION gateway.enqueue_job(p_scope text, p_key text, p_request_hash text,
  p_kind text, p_config jsonb) RETURNS SETOF public.processing_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE saved public.processing_jobs;
BEGIN
  IF length(p_scope) NOT BETWEEN 1 AND 128 OR length(p_key) NOT BETWEEN 1 AND 128
     OR p_request_hash !~ '^[0-9a-f]{64}$' OR p_scope IS NULL OR p_key IS NULL
     OR p_request_hash IS NULL OR jsonb_typeof(p_config) IS DISTINCT FROM 'object'
     OR octet_length(p_config::text)>65536 THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_job_request';
  END IF;
  INSERT INTO public.processing_jobs(id,scope,idempotency_key,request_hash,kind,config,status,
    attempt,max_attempts,deadline_at)
  VALUES(gen_random_uuid()::text,p_scope,p_key,p_request_hash,p_kind,p_config,'queued',0,3,
    statement_timestamp()+interval '15 minutes')
  ON CONFLICT(scope,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING * INTO saved;
  IF saved.request_hash<>p_request_hash THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='idempotency_conflict';
  END IF;
  RETURN NEXT saved;
END $$;

CREATE FUNCTION gateway.claim_job(p_worker text, p_lease_seconds integer DEFAULT 60)
RETURNS SETOF public.processing_jobs LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 128 OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 1 AND 300 THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_lease';
  END IF;
  UPDATE public.processing_jobs SET status='failed',error_code='deadline_or_attempts_exhausted',
    lease_token=NULL,lease_expires_at=NULL
  WHERE status IN ('queued','running') AND (deadline_at<=statement_timestamp()
    OR (status='running' AND lease_expires_at<=statement_timestamp() AND attempt>=max_attempts));
  RETURN QUERY WITH selected AS (
    SELECT id FROM public.processing_jobs
    WHERE (status='queued' OR (status='running' AND lease_expires_at<=statement_timestamp()))
      AND deadline_at>statement_timestamp() AND attempt<max_attempts
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE public.processing_jobs j SET status='running',worker_id=p_worker,
      lease_token=gen_random_uuid()::text, attempt=attempt+1,
      lease_expires_at=least(deadline_at,statement_timestamp()+make_interval(secs=>p_lease_seconds))
    FROM selected s WHERE j.id=s.id RETURNING j.*;
END $$;

CREATE FUNCTION gateway.heartbeat_job(p_id text,p_token text,p_lease_seconds integer DEFAULT 60)
RETURNS SETOF public.processing_jobs LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 300 THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_lease';
  END IF;
  RETURN QUERY UPDATE public.processing_jobs SET lease_expires_at=
    least(deadline_at,statement_timestamp()+make_interval(secs=>p_lease_seconds))
    WHERE id=p_id AND status='running' AND lease_token=p_token
      AND lease_expires_at>statement_timestamp() AND deadline_at>statement_timestamp()
    RETURNING *;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
END $$;

CREATE FUNCTION gateway.finish_job(p_id text,p_token text,p_status text,p_result jsonb DEFAULT NULL)
RETURNS SETOF public.processing_jobs LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('succeeded','failed')
    OR octet_length(coalesce(p_result::text,''))>65536 THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_completion';
  END IF;
  RETURN QUERY UPDATE public.processing_jobs SET status=p_status,result=p_result,
    lease_token=NULL,lease_expires_at=NULL
    WHERE id=p_id AND status='running' AND lease_token=p_token
      AND lease_expires_at>statement_timestamp() AND deadline_at>statement_timestamp()
    RETURNING *;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
END $$;

CREATE FUNCTION gateway.cancel_job(p_id text,p_scope text) RETURNS SETOF public.processing_jobs
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  UPDATE public.processing_jobs SET status='canceled',lease_token=NULL,lease_expires_at=NULL
  WHERE id=p_id AND scope=p_scope AND status IN ('queued','running') RETURNING *;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gateway FROM PUBLIC;
