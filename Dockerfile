FROM node:10
EXPOSE 3000
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --no-cache --production
COPY . .

CMD [ "yarn", "start" ]