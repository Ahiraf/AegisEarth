# Hugging Face Docker Space: backend API only, port 7860, UID 1000.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ARTIFACT_ROOT=/app/var/artifacts
RUN useradd --create-home --uid 1000 app
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir .
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
RUN mkdir -p /app/var/artifacts && chown -R app:app /app/var
USER app
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
