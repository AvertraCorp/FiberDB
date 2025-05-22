# Docker Deployment Guide

This guide explains how to deploy FiberDB using Docker and Docker Compose.

## Prerequisites

- Docker installed on your system
- Docker Compose installed on your system (optional, but recommended)

## Docker Image

FiberDB provides a Docker image based on the official Bun image. The Dockerfile configures the environment and installs all dependencies needed to run FiberDB.

### Building the Docker Image

To build the Docker image manually:

```bash
docker build -t fiberdb .
```

## Running with Docker Compose

Docker Compose provides the easiest way to start FiberDB, especially when you plan to add more services later.

### Starting the Services

```bash
# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f
```

The FiberDB server will start at `http://localhost:3000`.

### Stopping the Services

```bash
docker-compose down
```

### Cleaning Up

To remove all containers, networks, and volumes:

```bash
docker-compose down -v
```

## Running Manually with Docker

If you prefer to run without Docker Compose:

```bash
# Run the container
docker run -p 3000:3000 -v ./data:/app/data --name fiberdb fiberdb
```

### Container Options

- `-p 3000:3000`: Maps the container's port 3000 to your host machine
- `-v ./data:/app/data`: Mounts the `data` directory for persistent storage
- `--name fiberdb`: Names the container for easier reference

## Data Persistence

FiberDB stores its data in the `/app/data` directory inside the container. To persist this data:

1. Using the volume mount in docker-compose.yml (recommended)
2. Using a named volume: `-v fiberdb-data:/app/data`
3. Using a bind mount to a local directory: `-v ./data:/app/data`

## Running Commands Inside the Container

To run commands inside the running container:

```bash
# Run seeders
docker exec fiberdb bun run seed

# Run specific seeders
docker exec fiberdb bun run seed:sap

# Run benchmarks
docker exec fiberdb bun run benchmark

# Run examples
docker exec fiberdb bun run examples
```

## Development with Docker

For development purposes, you can mount your local codebase into the container:

```bash
docker run -p 3000:3000 -v $(pwd):/app -v /app/node_modules fiberdb bun run dev
```

This allows you to edit code locally while running it in the container.

## Environment Configuration

You can pass environment variables to the container using the `-e` flag or through docker-compose.yml:

```bash
docker run -p 3000:3000 -e NODE_ENV=production fiberdb
```

## Troubleshooting

### Container Fails to Start

Check the logs:

```bash
docker logs fiberdb
```

### Data Not Persisting

Verify your volume mounts:

```bash
docker inspect fiberdb
```

Look for the "Mounts" section to ensure volumes are correctly attached.

### Performance Issues

If you experience performance issues with the Docker setup:

1. Ensure sufficient memory allocation for Docker
2. Check CPU constraints on the container
3. For database-heavy operations, consider mounting the data directory on a fast storage device

## Custom Docker Configurations

You can customize the Docker setup by:

1. Extending the Dockerfile
2. Creating a custom docker-compose.yml file
3. Using environment variables to configure runtime behavior