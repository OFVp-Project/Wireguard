FROM ubuntu:latest AS downloadnode
ENV DEBIAN_FRONTEND="noninteractive"

# Install core packages
RUN apt update && apt -y install wget curl tar

# Install latest docker image
RUN mkdir /tmp/Node && NODEURL=""; NODEVERSION=$(curl -sL https://api.github.com/repos/nodejs/node/releases | grep tag_name | cut -d '"' -f 4 | sort -V | tail -n 1) && \
case $(uname -m) in \
  x86_64 ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-x64.tar.gz";; \
  aarch64 ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-arm64.tar.gz";; \
  armv7l ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-armv7l.tar.gz";; \
  ppc64le ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-ppc64le.tar.gz";; \
  s390x ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-s390x.tar.gz";; \
  *) echo "Unsupported architecture ($(uname -m))"; exit 1;; \
esac && \
echo "Node bin Url: ${NODEURL}"; wget -q "${NODEURL}" -O /tmp/node.tar.gz && \
tar xfz /tmp/node.tar.gz -C /tmp/Node && \
mkdir /tmp/nodebin && cp -rp /tmp/Node/*/* /tmp/nodebin && ls /tmp/nodebin && rm -rfv /tmp/nodebin/LICENSE /tmp/nodebin/*.md

FROM ubuntu:latest as server
LABEL org.opencontainers.image.title="OFVp Deamon Maneger"
LABEL org.opencontainers.image.description="Main docker image to maneger anothers docker images."
LABEL org.opencontainers.image.vendor="ofvp_project"
LABEL org.opencontainers.image.licenses="GPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/OFVp-Project/Wireguard"
ENV DEBIAN_FRONTEND="noninteractive"

# Copy node
COPY --from=downloadnode /tmp/nodebin/ /usr

# Install Openssh Server
RUN npm -g install npm@latest && apt update && apt install -y dkms wireguard net-tools iproute2 iptables

# Setup Project
WORKDIR /usr/src/Backend
ENV DAEMON_PASSWORD=""
ENV DAEMON_USER=""
ENV DAEMON_HOST="http://localhost:5000"
EXPOSE 51820/tcp
ENTRYPOINT [ "node", "--trace-warnings", "src/index.js" ]
COPY package*.json ./
RUN npm install --no-save
COPY ./ ./
