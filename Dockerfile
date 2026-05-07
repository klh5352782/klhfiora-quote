FROM node:14
WORKDIR /usr/app/fiora
COPY packages ./packages
COPY package.json tsconfig.json yarn.lock lerna.json ./
RUN touch .env
RUN yarn install
# 修改 engine.io 的 maxHttpBufferSize 为 50MB
RUN sed -i 's/maxHttpBufferSize: 1e6/maxHttpBufferSize: 52428800/g' /usr/app/fiora/packages/server/node_modules/engine.io/lib/server.js
RUN yarn build:web
CMD yarn start