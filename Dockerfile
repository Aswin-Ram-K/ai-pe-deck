# Lightweight Node 20 base — Alpine keeps the image small.
FROM node:20-alpine

WORKDIR /app

# Install deps first so Docker layer cache works.
COPY package.json ./
RUN npm install --omit=dev

# Copy the rest.
COPY . .

# The server auto-detects a free port starting at PORT (default 3000).
# Expose a reasonable range so docker-run can pick.
EXPOSE 3000

# Health check hits /healthz.
HEALTHCHECK --interval=30s --timeout=3s CMD \
  wget -qO- http://localhost:${PORT:-3000}/healthz > /dev/null || exit 1

CMD ["npm", "start"]
