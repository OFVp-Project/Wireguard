FROM debian:latest as server
LABEL org.opencontainers.image.title="OFVp Wireguard"
LABEL org.opencontainers.image.description="Docker image with Wireguard Connection and Maneger"
LABEL org.opencontainers.image.vendor="ofvp_project"
LABEL org.opencontainers.image.licenses="GPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/OFVp-Project/Wireguard"

# Install core packages
ENV DEBIAN_FRONTEND="noninteractive"
RUN apt update && apt install -y wget curl

# Install node.js
RUN wget -qO- https://raw.githubusercontent.com/Sirherobrine23/DebianNodejsFiles/main/debianInstall.sh | bash

# Install Wireguard
RUN apt update && apt install -y dkms wireguard net-tools iproute2 iptables systemctl

# Setup Project
ENV DAEMON_PASSWORD="" DAEMON_USER="" DAEMON_HOST="http://localhost:5000"
ENV MongoDB_URL="mongodb://localhost:27017/OFVpServer"
EXPOSE 51820:51820/udp
WORKDIR /app
ENTRYPOINT [ "node", "--trace-warnings", "dist/index.js" ]
STOPSIGNAL SIGINT
COPY package*.json ./
RUN npm install --no-save
COPY ./ ./
RUN npm run build