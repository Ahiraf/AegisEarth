# Project working instructions

- Current product: Cosmic Motion AI, a backend for SPHEREx image comparison and moving-source candidates.
- Work is backend-only: FastAPI, PostgreSQL, Python image processing, Docker and Hugging Face API deployment.
- The ML researcher builds, trains and scientifically evaluates the main model and supplies the inference package.
- The backend developer integrates that package, validates inference parity and handles serving, jobs, storage and deployment; model training is outside this backend work plan.
- Keep modules feature-based and distinguish implemented behavior from pipeline specifications.
- Do not reintroduce asteroid impact-risk or geographic impact-corridor features.

- Push project changes to the `main` branch, as requested by the user.
- Do not commit or push completed work unless the user explicitly asks for it.
- Use the user's `anindya357` GitHub account for Git authentication and commit attribution.
- Do not derive Git author identity from an unrelated connected GitHub account.
- Preserve existing remote history; do not force-push unless explicitly authorized.
