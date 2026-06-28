npm ci;
rm -rf /app/dist
npm run pipeline;
node /app/dist/main.js;