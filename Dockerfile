FROM node:22-slim

LABEL org.opencontainers.image.authors="https://github.com/dpembo/orchelium/issues"
LABEL org.opencontainers.image.url="ghcr.io/dpembo/orchelium/hub:latest"
LABEL org.opencontainers.image.documentation="https://github.com/dpembo/orchelium/tree/main/docs"
LABEL org.opencontainers.image="https://github.com/dpembo/orchelium"
LABEL org.opencontainers.image.source="https://github.com/dpembo/orchelium"
LABEL org.opencontainers.image.vendor="Orchelium.com"
LABEL org.opencontainers.image.title="Orchelium (Server)"
LABEL org.opencontainers.image.description="Orchelium is a lightweight yet powerful solution for managing and scheduling shell-based executions across a local area network. Designed for IT administrators, Orchelium ensures secure, encrypted communication between a central hub and remotely managed agents. It streamlines job execution, scheduling, monitoring, and notifications while maintaining a simple yet effective approach to backup and automation."
LABEL website="http://orchelium.com"
LABEL vendor="Orchelium.com"
LABEL url="https://orchelium.com"


RUN apt-get update && apt-get install -y tzdata
ENV TZ="UTC"
#ENV TZ="Europe/London"

WORKDIR /usr/src/app
COPY package*.json ./
COPY . .
RUN npm ci --omit=dev
EXPOSE 8082 49981
CMD ["node","server.js"]
