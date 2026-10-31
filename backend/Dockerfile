# Build from repository root: docker build -f backend/Dockerfile .
FROM python:3.12-slim@sha256:aa943ce411423c7582288f18707ff66eddcbaeb510502d747a72aeb34f30d159
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ARTIFACT_ROOT=/app/var/artifacts
RUN useradd --create-home --uid 1000 app
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/requirements.lock backend/requirements-build.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock -r requirements-build.lock
COPY backend/app ./app
RUN pip install --no-cache-dir --no-deps --no-build-isolation .
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
RUN mkdir -p /app/var/artifacts && chown -R app:app /app/var
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--no-proxy-headers", "--host", "0.0.0.0", "--port", "8000"]
