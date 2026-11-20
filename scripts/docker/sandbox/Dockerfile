FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1

RUN apt-get update \
  && apt-get install --no-install-recommends -y bash python3 \
  && npm install --global @nubjs/nub@0.11.1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
USER 1000:1000

CMD ["sleep", "infinity"]
