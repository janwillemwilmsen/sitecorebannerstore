FROM node:20-alpine

WORKDIR /app

# Install only production dependencies for smaller image size.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
