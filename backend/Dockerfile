FROM node:20-alpine 

WORKDIR /app
COPY backend/package.json ./package.json
RUN npm install --omit=dev

COPY backend/src ./src
COPY backend/db ./db
COPY redis ./redis

EXPOSE 8080
CMD ["npm", "run", "start"]
