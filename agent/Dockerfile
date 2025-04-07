FROM node:20

WORKDIR /usr/src/app
COPY package*.json ./
COPY . .


# Install curl for health check
RUN apt-get update && apt-get install -y curl
RUN apt-get install -y rsync

RUN npm install
EXPOSE 49991

# Health check to call the internal REST API for liveness details
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD curl --fail http://localhost:49991/ | grep '"status":"ok"' || exit 1

ENTRYPOINT ["node", "agent.js"]
