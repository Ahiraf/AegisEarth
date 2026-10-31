CREATE FUNCTION gateway.discovery_lookup(p_snapshot_id text DEFAULT NULL,
 p_query_hash text DEFAULT NULL, p_product_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF p_product_id IS NOT NULL THEN
   RETURN (SELECT payload::jsonb FROM public.source_products WHERE id=p_product_id);
 ELSIF p_snapshot_id IS NOT NULL THEN
   RETURN (SELECT payload::jsonb FROM public.discovery_snapshots WHERE id=p_snapshot_id);
 ELSE
   RETURN (SELECT payload::jsonb FROM public.discovery_snapshots WHERE query_hash=p_query_hash
           ORDER BY created_at DESC, id DESC LIMIT 1);
 END IF;
END $$;

CREATE FUNCTION gateway.discovery_save(p_snapshot jsonb, p_products jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE product jsonb;
BEGIN
 IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_products) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_products)>160
 OR octet_length(p_snapshot::text)+octet_length(p_products::text)>900000
 OR (p_snapshot->>'query_hash') IS NULL
 OR (p_snapshot->>'query_hash') !~ '^[0-9a-f]{64}$' THEN
   RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_discovery_snapshot';
 END IF;
 FOR product IN SELECT value FROM jsonb_array_elements(p_products) LOOP
   IF (product->>'id') IS NULL OR (product->>'id') !~ '^[0-9a-f]{64}$' THEN
     RAISE SQLSTATE 'PT422' USING MESSAGE='invalid_product';
   END IF;
   INSERT INTO public.source_products(id,payload) VALUES(product->>'id',product)
   ON CONFLICT(id) DO NOTHING;
   IF (SELECT payload::jsonb FROM public.source_products WHERE id=product->>'id')<>product THEN
     RAISE SQLSTATE 'PT409' USING MESSAGE='immutable_product_conflict';
   END IF;
 END LOOP;
 INSERT INTO public.discovery_snapshots(id,query_hash,created_at,payload)
 VALUES(p_snapshot->>'id',p_snapshot->>'query_hash',
       (p_snapshot->>'created_at_utc')::timestamptz,p_snapshot);
 RETURN jsonb_build_object('saved',true);
END $$;
REVOKE ALL ON FUNCTION gateway.discovery_lookup(text,text,text), gateway.discovery_save(jsonb,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION gateway.readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 PERFORM id FROM public.processing_jobs LIMIT 1;
 PERFORM id FROM public.discovery_snapshots LIMIT 1;
 PERFORM id FROM public.source_products LIMIT 1;
 IF NOT EXISTS(SELECT 1 FROM public.alembic_version WHERE version_num='cosmic_0003') THEN
   RAISE EXCEPTION 'schema_not_ready';
 END IF;
 RETURN jsonb_build_object('status','ready','schema_revision','cosmic_0003');
END $$;
