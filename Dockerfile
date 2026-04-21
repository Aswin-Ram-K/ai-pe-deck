# Lightweight Node 20 base — Alpine keeps the image small.
# Pinned to the 20.18 line for build-to-build reproducibility.
FROM node:20.18-alpine

WORKDIR /app

# Install deps first so Docker layer cache works.
# `npm ci` uses the committed lockfile for deterministic installs —
# refuses to run if package.json and package-lock.json disagree,
# which is exactly the guarantee we want for a timed presentation.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest.
COPY . .

# The server auto-detects a free port starting at PORT (default 3000).
# Expose a reasonable range so docker-run can pick.
EXPOSE 3000

# Health check hits /healthz.
HEALTHCHECK --interval=30s --timeout=3s CMD \
  wget -qO- http://localhost:${PORT:-3000}/healthz > /dev/null || exit 1

CMD ["npm", "start"]
