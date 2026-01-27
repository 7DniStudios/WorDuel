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
DB_USER=admin
DB_PASS=admin
DB_NAME=worduel_db
DB_HOST=localhost
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

## Running Backend Locally

For this you need to have the database docker running BUT `worduel_gateway` and `worduel` services stopped.

With such setup it is enough to run:

```bash
# In backend/ directory
npm run dev
```

Alternatively to run with live css and TS generation:

```bash
# In backend/ directory
npm run dev & npm run watch:css
# Note: For some reason 'tailwindcss' is stingy about having access to stdin...
```

## Upload debug-data to Postgress

```bash
cat ${SQL_FILE} | docker exec -i worduel_db psql -d worduel_db -U admin -h localhost -p 5432 -f-
```

## Debug Logs From Backend

To see debug logs from backend (when it is running in docker):

```bash
docker logs -f worduel
# Works for other containers as well.
```

> To run with minimal logging set environment variable `DEV_ENVIRONMENT=production`.
