"""Grant only the local gateway role needed privileges after migrations; never print credentials."""

import os

import psycopg

with psycopg.connect(
    os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
) as connection:
    connection.execute("GRANT USAGE ON SCHEMA gateway, public TO cosmic_api")
    connection.execute(
        "GRANT SELECT ON observations, processing_jobs, alembic_version, source_products, discovery_snapshots, sky_views, view_submissions, view_files, prepared_frame_sets, prepared_artifacts TO cosmic_api"
    )
    connection.execute("GRANT INSERT, UPDATE ON processing_jobs TO cosmic_api")
    connection.execute("GRANT INSERT ON sky_views, view_submissions TO cosmic_api")
    connection.execute(
        "GRANT INSERT ON source_products, discovery_snapshots, sky_views, view_submissions, view_files, prepared_frame_sets, prepared_artifacts TO cosmic_api"
    )
    connection.execute("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gateway TO cosmic_api")
    connection.execute("NOTIFY pgrst, 'reload schema'")
print("Local restricted gateway role provisioned")
