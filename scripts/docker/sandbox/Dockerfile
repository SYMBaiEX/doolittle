FROM node:26.5.0-bookworm-slim@sha256:2d49d876e96237d76de412761cf05dbfe5aee325cc4406a4d41d5824c5bb8beb

RUN apt-get update \
  && apt-get install --no-install-recommends -y bash python3 \
  && npm install --global @nubjs/nub@0.7.4 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
USER 1000:1000

CMD ["sleep", "infinity"]
