CREATE FUNCTION gateway.ranker_submit(p_id text,p_scope text,p_ip text,p_key text,p_hash text,
 p_digest text,p_snapshot text,p_canonical jsonb,p_config jsonb,p_policy jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE accepted jsonb; product jsonb; snapshot jsonb;
BEGIN
 SELECT payload::jsonb INTO snapshot FROM public.discovery_snapshots WHERE id=p_snapshot;
 IF snapshot IS NULL OR p_canonical->>'contract_version' IS DISTINCT FROM 'metadata-ranker-v1'
 OR p_canonical->>'method' IS DISTINCT FROM 'metadata_ranker'
 OR p_canonical->>'snapshot_id' IS DISTINCT FROM p_snapshot
 OR p_config->'ranker' IS DISTINCT FROM p_canonical
 OR p_config->'region' IS DISTINCT FROM snapshot->'canonical_query'->'region'
 OR jsonb_typeof(p_config->'products') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_config->'products') NOT BETWEEN 6 AND 12
 OR octet_length(p_config::text)>384000 THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_ranker_request';
 END IF;
 FOR product IN SELECT value FROM jsonb_array_elements(p_config->'products') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'items') item WHERE item=product) THEN
     RAISE SQLSTATE 'PT409' USING MESSAGE='ranker_product_not_in_snapshot';
   END IF;
 END LOOP;
 accepted:=gateway.view_submit(p_id,p_scope,p_ip,p_key,p_hash,p_digest,p_hash,p_snapshot,
   p_canonical,p_config->'products',p_policy);
 IF (accepted->>'created')::boolean THEN
   UPDATE public.processing_jobs SET kind='suggestions',config=p_config,max_attempts=2
   WHERE id=accepted->>'id';
 END IF;
 RETURN accepted;
END $$;

CREATE FUNCTION gateway.ranker_cutout_lookup(p_product text,p_url text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT f.payload::jsonb FROM public.view_files f
 JOIN public.sky_views v ON v.id=f.view_id JOIN public.processing_jobs j ON j.id=v.id
 WHERE f.product_id=p_product AND f.payload->>'source_url'=p_url
 AND f.published AND NOT f.storage_deleted AND v.expires_at>statement_timestamp()
 AND j.status='succeeded' ORDER BY j.created_at DESC LIMIT 1;
$$;

CREATE FUNCTION gateway.ranker_complete(p_id text,p_token text,p_files jsonb,p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE job public.processing_jobs; candidate jsonb; model jsonb;
BEGIN
 SELECT * INTO job FROM public.processing_jobs WHERE id=p_id AND kind='suggestions'
 AND status='running' AND lease_token=p_token AND lease_expires_at>statement_timestamp()
 AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 IF p_report->>'method' IS DISTINCT FROM 'metadata_ranker'
 OR p_report->>'score_kind' IS DISTINCT FROM 'candidate_score'
 OR jsonb_typeof(p_report->'candidates') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_report->'candidates')>32 OR octet_length(p_report::text)>256000 THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_ranker_result';
 END IF;
 model:=p_report->'model';
 IF model->>'version' IS DISTINCT FROM job.config->'ranker'->>'model_version'
 OR model->>'sha256' IS DISTINCT FROM job.config->'ranker'->>'model_sha256' THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE='ranker_model_changed';
 END IF;
 PERFORM gateway.complete_view(p_id,p_token,p_files);
 INSERT INTO public.model_versions(id,name,version,method,calibrated,weights_key,weights_sha256,evaluation)
 VALUES(model->>'version','AegisEarth ranker',model->>'version','metadata_ranker',false,
 'model_packages/aegis_ranker_v2/ranker_AB_v3.json',model->>'sha256',
 jsonb_build_object('validated_threshold',0.2951,'validated_false_alert_target',0.05,
 'score_kind','candidate_score','package_version',2))
 ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.model_versions WHERE id=model->>'version'
 AND weights_sha256=model->>'sha256' AND method='metadata_ranker' AND NOT calibrated) THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE='ranker_model_identity_conflict';
 END IF;
 INSERT INTO public.analysis_runs(id,status,pipeline_version,config,request_hash)
 VALUES(p_id,'succeeded','metadata-ranker-v1',job.config->'ranker',job.request_hash);
 FOR candidate IN SELECT value FROM jsonb_array_elements(p_report->'candidates') LOOP
   IF candidate->>'classification' NOT IN ('possible_motion','uncertain')
   OR candidate->>'classification' IS DISTINCT FROM candidate->>'classification_hint'
   OR candidate->>'score_kind' IS DISTINCT FROM 'candidate_score'
   OR candidate->>'model_version_id' IS DISTINCT FROM model->>'version'
   OR jsonb_typeof(candidate->'warnings') IS DISTINCT FROM 'array' THEN
     RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_ranker_candidate';
   END IF;
   INSERT INTO public.candidates(id,analysis_id,classification,ra_deg,dec_deg,displacement_arcsec,
     score,score_kind,model_version_id,evidence,score_uncertainty,warnings)
   VALUES(candidate->>'id',p_id,candidate->>'classification',(candidate->>'ra_deg')::float8,
     (candidate->>'dec_deg')::float8,(candidate->>'displacement_arcsec')::float8,
     (candidate->>'score')::float8,'candidate_score',model->>'version',candidate->'evidence',
     (candidate->>'score_uncertainty')::float8,candidate->'warnings');
 END LOOP;
 UPDATE public.processing_jobs SET result=p_report WHERE id=p_id;
 RETURN jsonb_build_object('id',p_id,'status','succeeded');
END $$;

CREATE FUNCTION gateway.ranker_get(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',j.id,'status',j.status,'method','metadata_ranker',
 'error_code',j.error_code,'expires_at_utc',v.expires_at,
 'expired',coalesce(v.expires_at<=statement_timestamp(),false),
 'result',CASE WHEN j.status='succeeded' AND v.expires_at>statement_timestamp() THEN j.result ELSE NULL END)
 FROM public.processing_jobs j JOIN public.sky_views v ON v.id=j.id
 WHERE j.id=p_id AND j.kind='suggestions' AND j.config ? 'ranker';
$$;
REVOKE ALL ON FUNCTION gateway.ranker_submit(text,text,text,text,text,text,text,jsonb,jsonb,jsonb),
 gateway.ranker_cutout_lookup(text,text),gateway.ranker_complete(text,text,jsonb,jsonb),
 gateway.ranker_get(text) FROM PUBLIC;
