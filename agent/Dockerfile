FROM ghcr.io/dpembo/orchelium/agent:latest

# Install curl and rsync so users can extend the image for their backup scripts
RUN apt-get update && apt-get install -y --no-install-recommends curl rsync && rm -rf /var/lib/apt/lists/*

EXPOSE 49991

# Health check to call the internal REST API for liveness details
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD curl --fail http://localhost:49991/ | grep '"status":"ok"' || exit 1

ENTRYPOINT ["node", "agent.js"]
