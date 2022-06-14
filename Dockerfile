FROM debian:latest
LABEL org.opencontainers.image.title="OFVp Wireguard" \
  org.opencontainers.image.description="Docker image with Wireguard Connection and Maneger" \
  org.opencontainers.image.vendor="ofvp_project" \
  org.opencontainers.image.licenses="GPL-3.0-or-later" \
  org.opencontainers.image.source="https://github.com/OFVp-Project/Wireguard"

# Install Basic packages
ARG DEBIAN_FRONTEND="noninteractive"
RUN apt update && apt install -y git curl wget sudo && wget -qO- https://raw.githubusercontent.com/Sirherobrine23/DebianNodejsFiles/main/debianInstall.sh | bash

# Install Wireguard and dependencies
RUN apt update && apt install -y dkms wireguard net-tools iproute2 iptables systemctl

# Setup Project
ENV DAEMON_PASSWORD="" DAEMON_USER="" DAEMON_HOST="http://localhost:5000"
EXPOSE 51820:51820/udp
WORKDIR /app
ENTRYPOINT [ "node", "--trace-warnings", "dist/index.js" ]
STOPSIGNAL SIGINT
COPY package*.json ./
RUN npm install --no-save
COPY ./ ./
RUN npm run build