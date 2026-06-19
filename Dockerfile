FROM node:24-alpine

WORKDIR /app

COPY . .

CMD ["/app/run.sh"]