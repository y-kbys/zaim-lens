FROM python:3.11-slim

# Install uv binary from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uv/bin/

WORKDIR /app

# Enable bytecode compilation and optimization
ENV UV_COMPILE_BYTECODE=1

# Copy dependency definition files first to leverage Docker layer caching
COPY pyproject.toml uv.lock ./

# Synchronize dependencies (equivalent to pip install -r requirements.txt)
# --frozen: ensures versions match uv.lock
# --no-install-project: avoids installing the current project (just dependencies)
# --no-dev: excludes development dependencies
RUN /uv/bin/uv sync --frozen --no-install-project --no-dev

# Copy the application source code
COPY . .

# Cloud Run injects the PORT environment variable (default 8080)
ENV PORT=8080

# Execute the application using 'uv run' to ensure the synchronized venv is used
CMD ["/uv/bin/uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
