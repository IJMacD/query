FROM node:12-alpine
EXPOSE 3000
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --no-cache --production
COPY . .

CMD [ "node", "./server.js" ]