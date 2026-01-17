# Developer Guide

## Using Docker Compose

```bash
# Build and start services.
docker compose up --build

# Rebuild a specific service.
docker compose up --build <service-name>

# Stop and remove the containers.
docker compose down

# Delete all volumes (data will be lost).
docker compose down -v
```

## Secret Generation

We do not keep `.env` file on github.  
For local development one can use the following default values:

```
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin
POSTGRES_DB=worduel_db
DB_HOST=db
DB_PORT=5432

BACKEND_PORT=3000
FRONTEND_PORT=80
FRONTEND_PORT_SSL=443
ADMINER_PORT=8080

JWT_SECRET=a_very_important_secret
```

## SSL Certificates

Standard self-signed SSL certificate:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout nginx.key -out nginx.crt
```

> Place it in `.certs/` directory.
