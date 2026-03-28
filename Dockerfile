# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install LibreOffice and dependencies for PDF conversions (Word-to-PDF / PPT-to-PDF)
RUN apt-get update && apt-get install -y \
    libreoffice \
    fonts-liberation \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose port (Render sets PORT environment variable, defaults to 10000)
ENV PORT=10000
EXPOSE $PORT

# Start application using Gunicorn for production
CMD gunicorn --bind 0.0.0.0:$PORT app:app
