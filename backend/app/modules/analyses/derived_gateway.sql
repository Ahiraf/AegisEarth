CREATE FUNCTION gateway.derived_submit(p_id text,p_scope text,p_ip text,p_key text,p_hash text,p_digest text,
 p_canonical jsonb,p_parents jsonb,p_config jsonb,p_policy jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE parent jsonb; source jsonb; report jsonb; frame jsonb; accepted jsonb; snapshot text;
BEGIN
 PERFORM pg_advisory_xact_lock(73624103);
 IF p_canonical->>'kind' NOT IN ('coadd','difference','spectrum') OR p_canonical->>'contract_version'<>'derived-v1'
 OR octet_length(p_config::text)>512000 OR jsonb_array_length(p_parents) NOT BETWEEN 1 AND 6
 OR jsonb_array_length(p_config->'sources') NOT BETWEEN 1 AND 12
 OR jsonb_array_length(p_config->'sources')<>jsonb_array_length(p_config->'products')
 OR p_config->'derived'<>p_canonical THEN RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_derived_config'; END IF;
 FOR parent IN SELECT value FROM jsonb_array_elements(p_parents) LOOP
   report:=gateway.frame_set_get(parent->>'id');
   IF report IS NULL OR report<>parent->'report' OR report->>'version'<>'frames-v1' THEN
     RAISE SQLSTATE 'PT409' USING MESSAGE='derived_parent_changed_or_expired'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.sky_views WHERE id=parent->>'id' AND expires_at>statement_timestamp()+interval '15 minutes') THEN
     RAISE SQLSTATE 'PT409' USING MESSAGE='derived_parent_retention_too_short'; END IF;
 END LOOP;
 FOR source IN SELECT value FROM jsonb_array_elements(p_config->'sources') LOOP
   SELECT p->'report' INTO report FROM jsonb_array_elements(p_parents) p WHERE p->>'id'=source->'ref'->>'view_id';
   frame:=report->'frames'->((source->'ref'->>'index')::int);
   IF frame IS NULL OR frame<>source->'metadata'
   OR source->'raw' IS DISTINCT FROM gateway.view_artifact(frame->>'raw_artifact_id')
   OR source->'planes' IS DISTINCT FROM gateway.view_artifact(report->'artifacts'->((frame->'artifact_indices'->>'planes')::int)->>'id') THEN
     RAISE SQLSTATE 'PT409' USING MESSAGE='derived_source_changed_or_expired'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'products') p WHERE NOT EXISTS(
   SELECT 1 FROM public.source_products s WHERE s.id=p->>'id' AND s.payload::jsonb=p)) THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE='derived_product_changed'; END IF;
 SELECT v.snapshot_id INTO snapshot FROM public.sky_views v WHERE v.id=p_canonical->>'primary_view_id';
 accepted:=gateway.view_submit(p_id,p_scope,p_ip,p_key,p_hash,p_digest,p_hash,snapshot,p_canonical,p_config->'products',p_policy);
 IF (accepted->>'created')::boolean THEN
   UPDATE public.processing_jobs SET kind=p_canonical->>'kind',config=p_config WHERE id=accepted->>'id';
 END IF;
 RETURN accepted;
END $$;

CREATE OR REPLACE FUNCTION gateway.readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.alembic_version WHERE version_num='cosmic_0007') THEN RAISE EXCEPTION 'schema_not_ready'; END IF;
 RETURN jsonb_build_object('status','ready','schema_revision','cosmic_0007');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gateway FROM PUBLIC;
