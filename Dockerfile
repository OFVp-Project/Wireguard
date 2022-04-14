FROM ubuntu:latest as server
LABEL org.opencontainers.image.title="OFVp Wireguard"
LABEL org.opencontainers.image.description="Main docker image to maneger anothers docker images."
LABEL org.opencontainers.image.vendor="ofvp_project"
LABEL org.opencontainers.image.licenses="GPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/OFVp-Project/Wireguard"
ENV DEBIAN_FRONTEND="noninteractive"

# Install node
RUN \
  apt update && apt install -y curl wget && \
  VERSION=$(wget -qO- https://api.github.com/repos/Sirherobrine23/DebianNodejsFiles/releases/latest |grep 'name' | grep "nodejs"|grep "$(dpkg --print-architecture)"|cut -d '"' -f 4 | sed 's|nodejs_||g' | sed -e 's|_.*.deb||g'|sort | uniq|tail -n 1); \
  wget -q "https://github.com/Sirherobrine23/DebianNodejsFiles/releases/download/debs/nodejs_${VERSION}_$(dpkg --print-architecture).deb" -O /tmp/nodejs.deb && \
  apt remove --purge -y wget curl && \
  dpkg -i /tmp/nodejs.deb && rm -rfv /tmp/nodejs.deb && \
  npm install -g npm@latest

# Install Wireguard
RUN apt update && apt install -y dkms wireguard net-tools iproute2 iptables

# Setup Project
ENV DAEMON_PASSWORD=""
ENV DAEMON_USER=""
ENV DAEMON_HOST="http://localhost:5000"
EXPOSE 51820:51820/udp
WORKDIR /app
ENTRYPOINT [ "node", "--trace-warnings", "dist/index.js" ]
COPY package*.json ./
RUN npm install --no-save
COPY ./ ./
RUN npm run build