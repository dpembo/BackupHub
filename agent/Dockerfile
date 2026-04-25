FROM node:22

LABEL org.opencontainers.image.authors="https://github.com/dpembo/orchelium/issues"
LABEL org.opencontainers.image.url="ghcr.io/dpembo/orchelium/agent:latest"
LABEL org.opencontainers.image.documentation="https://github.com/dpembo/orchelium/tree/main/docs"
LABEL org.opencontainers.image.source="https://github.com/dpembo/orchelium"
LABEL org.opencontainers.image.vendor="Orchelium.com"
LABEL org.opencontainers.image.title="Orchelium (Agent)"
LABEL org.opencontainers.image.description="Orchelium agent executes scheduled jobs and reports results securely to the Orchelium hub."

WORKDIR /usr/src/app
COPY package*.json ./
COPY . .


# Install curl for health check
RUN apt-get update && apt-get install -y curl
RUN apt-get install -y rsync

RUN npm ci --omit=dev
EXPOSE 49991

# Health check to call the internal REST API for liveness details
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD curl --fail http://localhost:49991/ | grep '"status":"ok"' || exit 1

ENTRYPOINT ["node", "agent.js"]
