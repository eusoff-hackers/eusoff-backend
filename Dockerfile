FROM node:20-alpine

WORKDIR /usr/src/
COPY package.json ./
COPY package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

ENV WAIT_VERSION 2.7.2
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/$WAIT_VERSION/wait /wait
RUN chmod +x /wait

RUN npm run build

CMD /wait && npm run prod
