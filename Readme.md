# WorDuel

## Running with Docker Compose

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
