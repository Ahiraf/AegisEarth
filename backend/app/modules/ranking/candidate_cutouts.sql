-- Candidate-centred inputs have a product+URL identity, not a product-only hash pin.
-- Separate functions preserve the viewer's stricter fixed-input contract unchanged.
CREATE FUNCTION gateway.ranker_prepare_cutout(p_id text,p_token text,p_file jsonb,p_product jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE job public.processing_jobs; previous text;
BEGIN
 SELECT * INTO job FROM public.processing_jobs WHERE id=p_id AND kind='suggestions'
 AND status='running' AND lease_token=p_token AND lease_expires_at>statement_timestamp()
 AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 IF job.config->'ranker'->>'cutout_policy' IS DISTINCT FROM 'per_candidate_centered_v1'
 OR p_product->>'id' IS NULL OR p_product->>'id' !~ '^[0-9a-f]{64}$'
 OR p_file->>'product_id' IS DISTINCT FROM p_product->>'id'
 OR p_file->>'acquisition_key' IS NULL OR p_file->>'acquisition_key' !~ '^[0-9a-f]{64}$'
 OR p_file->>'sha256' IS NULL OR p_file->>'sha256' !~ '^[0-9a-f]{64}$'
 OR p_file->>'storage_key' IS DISTINCT FROM ('objects/'||p_id||'/'||p_token||'/'||(p_file->>'sha256')||'.fits')
 OR (p_file->>'size_bytes')::bigint NOT BETWEEN 1 AND 134217728
 OR (p_file->>'cutout_size_arcmin')::int IS DISTINCT FROM 15
 OR octet_length(p_file::text)+octet_length(p_product::text)>65536
 OR (SELECT count(*) FROM public.view_files WHERE view_id=p_id AND payload->>'storage_key' LIKE 'objects/'||p_id||'/'||p_token||'/%')>=384
 THEN RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_ranker_cutout'; END IF;
 SELECT payload->>'sha256' INTO previous FROM public.view_files WHERE view_id=p_id
 AND payload->>'acquisition_key'=p_file->>'acquisition_key' LIMIT 1;
 IF previous IS NOT NULL AND previous<>p_file->>'sha256' THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE='source_changed';
 END IF;
 INSERT INTO public.source_products(id,payload) VALUES(p_product->>'id',p_product)
 ON CONFLICT(id) DO NOTHING;
 -- Snapshot products intentionally omit raw source_metadata and carry display-only alternates.
 -- Compare immutable normalized content, and raw metadata as well when it is supplied.
 IF (SELECT payload::jsonb-'source_metadata'-'alternate_product_ids' FROM public.source_products WHERE id=p_product->>'id')
 IS DISTINCT FROM (p_product-'source_metadata'-'alternate_product_ids')
 OR (p_product ? 'source_metadata' AND
     (SELECT payload->'source_metadata' FROM public.source_products WHERE id=p_product->>'id')::jsonb
     IS DISTINCT FROM p_product->'source_metadata') THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE='immutable_product_conflict';
 END IF;
 INSERT INTO public.view_files(id,view_id,product_id,payload,storage_deleted,published)
 VALUES(p_file->>'id',p_id,p_file->>'product_id',p_file,false,false);
 RETURN jsonb_build_object('prepared',true);
END $$;

CREATE FUNCTION gateway.ranker_publish_inputs(p_id text,p_token text,p_files jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE job public.processing_jobs; item jsonb; total bigint:=0;
BEGIN
 SELECT * INTO job FROM public.processing_jobs WHERE id=p_id AND kind='suggestions'
 AND status='running' AND lease_token=p_token AND lease_expires_at>statement_timestamp()
 AND deadline_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='lease_lost'; END IF;
 IF jsonb_typeof(p_files) IS DISTINCT FROM 'array' OR jsonb_array_length(p_files)>384
 OR octet_length(p_files::text)>4000000
 OR (SELECT count(DISTINCT f->>'acquisition_key') FROM jsonb_array_elements(p_files) f)<>jsonb_array_length(p_files) THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_ranker_inputs';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_files) LOOP
   IF item->>'storage_key' IS DISTINCT FROM ('objects/'||p_id||'/'||p_token||'/'||(item->>'sha256')||'.fits')
   OR (item->>'size_bytes')::bigint NOT BETWEEN 1 AND 134217728 THEN
     RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_ranker_artifact';
   END IF;
   UPDATE public.view_files SET published=true WHERE id=item->>'id' AND view_id=p_id
   AND payload::jsonb=item AND NOT storage_deleted AND NOT published;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='upload_not_prepared'; END IF;
   total:=total+(item->>'size_bytes')::bigint;
 END LOOP;
 IF total>(job.config->'limits'->>'total_bytes')::bigint THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='total_bytes_exceeded';
 END IF;
 UPDATE public.sky_views SET expires_at=statement_timestamp()+interval '24 hours' WHERE id=p_id;
 UPDATE public.processing_jobs SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,
 error_code=NULL WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION gateway.ranker_prepare_cutout(text,text,jsonb,jsonb),
 gateway.ranker_publish_inputs(text,text,jsonb) FROM PUBLIC;
