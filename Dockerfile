FROM node:10
EXPOSE 3000
WORKDIR /usr/src/app
COPY yarn.lock .
RUN yarn
COPY . .

CMD [ "yarn", "start" ]