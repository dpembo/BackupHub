#FROM node:20
FROM node:20-slim

RUN apt-get update && apt-get install -y tzdata
ENV TZ="UTC"
#ENV TZ="Europe/London"

WORKDIR /usr/src/app
COPY package*.json ./
COPY . .
RUN npm install
EXPOSE 8082 49981
CMD ["node","server.js"]
