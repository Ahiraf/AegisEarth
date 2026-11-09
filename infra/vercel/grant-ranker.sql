-- Apply on the hosted database after migrating through cosmic_0010.
GRANT EXECUTE ON FUNCTION
    gateway.ranker_submit(text,text,text,text,text,text,text,jsonb,jsonb,jsonb),
    gateway.ranker_get(text),
    gateway.ranker_cutout_lookup(text,text),
    gateway.ranker_prepare_cutout(text,text,jsonb,jsonb),
    gateway.ranker_publish_inputs(text,text,jsonb),
    gateway.ranker_complete(text,text,jsonb,jsonb)
TO aegisearth_runtime;
