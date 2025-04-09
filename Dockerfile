FROM node:20-slim

LABEL org.opencontainers.image.authors="https://github.com/dpembo/BackupHub/issues"
LABEL org.opencontainers.image.url="ghcr.io/dpembo/backuphub/hub:latest"
LABEL org.opencontainers.image.documentation="https://github.com/dpembo/BackupHub/tree/main/docs"
LABEL org.opencontainers.image="https://github.com/dpembo/BackupHub"
LABEL org.opencontainers.image.source="https://github.com/dpembo/BackupHub"
LABEL org.opencontainers.image.vendor="pembo.co.uk"
LABEL org.opencontainers.image.title="BackupHub (Server)"
LABEL org.opencontainers.image.description="BackupHub is a lightweight yet powerful solution for managing and scheduling shell-based executions across a local area network. Designed for IT administrators, BackupHub ensures secure, encrypted communication between a central hub and remotely managed agents. It streamlines job execution, scheduling, monitoring, and notifications while maintaining a simple yet effective approach to backup and automation."
LABEL website="http://pembo.co.uk"
LABEL vendor="pembo.co.uk"
LABEL url="https://pembo.co.uk"


RUN apt-get update && apt-get install -y tzdata
ENV TZ="UTC"
#ENV TZ="Europe/London"

WORKDIR /usr/src/app
COPY package*.json ./
COPY . .
RUN npm install
EXPOSE 8082 49981
CMD ["node","server.js"]
