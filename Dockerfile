# Hugging Face Docker Space: backend API only, port 7860, UID 1000.
FROM python:3.12-slim@sha256:aa943ce411423c7582288f18707ff66eddcbaeb510502d747a72aeb34f30d159
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ARTIFACT_ROOT=/app/var/artifacts
RUN useradd --create-home --uid 1000 app
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/requirements.lock backend/requirements-build.lock ./
COPY backend/requirements-ranking.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock -r requirements-build.lock
ARG INSTALL_METADATA_RANKER=false
RUN if [ "$INSTALL_METADATA_RANKER" = "true" ]; then pip install --no-cache-dir -r requirements-ranking.txt; fi
COPY backend/app ./app
COPY backend/model_packages ./model_packages
RUN pip install --no-cache-dir --no-deps --no-build-isolation .
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY infra/vercel/container-start.sh ./container-start.sh
RUN mkdir -p /app/var/artifacts && chown -R app:app /app/var
USER app
EXPOSE 7860
ENTRYPOINT ["/bin/sh", "/app/container-start.sh"]
CMD ["uvicorn", "app.main:app", "--no-proxy-headers", "--host", "0.0.0.0", "--port", "7860"]
