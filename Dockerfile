# Hugging Face Docker Space: React assets and FastAPI share public port 7860.
FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STATIC_DIR=/app/static
RUN useradd --create-home --uid 1000 app
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir .
COPY --chown=app backend/alembic.ini ./
COPY --chown=app backend/migrations ./migrations
COPY --from=frontend --chown=app /build/dist ./static
USER app
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
