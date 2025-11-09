FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set PYTHONPATH so imports work correctly
# The code structure expects etl/ as a package, so we need to set PYTHONPATH to parent
ENV PYTHONPATH=/workspace

# Default command
CMD ["python", "main.py"]

