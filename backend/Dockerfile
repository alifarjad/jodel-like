FROM node:19-alpine3.15
WORKDIR /usr/app
COPY ./package.json ./
RUN npm install
COPY ./app.js ./index.html ./thread.html ./
EXPOSE 5002
ENTRYPOINT ["node", "app.js"]