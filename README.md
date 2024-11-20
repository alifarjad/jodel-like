# Message board
## Message board
The project is to develop a Jamstack-like web application like Jodel or Reddit

![](https://github.com/alifarjad/jodel-like/blob/main/demo1.gif)

The whole application features:
- A main page wich indicates the current user, the list of the 20 most recent messages, a form to post a message
- A message page that shows the list of the 20 most recent messages

In addition to this, the application also features:
- Upvote and downvote button for messages and replies with an upvote count that gets updated every few seconds 
- User and timestamp for each message and reply that also indicate to the user whether it was posted by them
- Reply button with comment count that gets updated every few seconds, clicking on the reply button open the message page.
- Infinite scroll once the user gets to the bottom of the page (for both messages and replies), the page will try to fetch more messages in any case if the current items displayed is less than 20
- Lighthouse Performance score of 100 for both main and message page
- Automatic scaling based on load by kubernetes

![](https://github.com/alifarjad/jodel-like/blob/main/demo2.gif)

The project is composed of:
- PostgreSQL : Database to store replies, messages, votes.

- Express JS Server: serves pages and api

## Running the application
To run the application you need to have minikube (and running) and kubectl installed. After that you need to enable ingress functionality for minikube with the following command:
```
minikube addons enable ingress
```

After that you should run the following commands (be sure to be in the project root directory):
```
kubectl apply -f \
  https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.18/releases/cnpg-1.18.0.yaml
kubectl apply -f pg_cluster.yaml
kubectl apply -f backend-deployment.yaml
kubectl apply -f backend-service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f scaler.yaml
```

To get the address of the UI you should type this command:

```
kubectl describe ingress ingress #The application is served on the address specified by the 'Address' field of the ouput

eg.
alfredo:~/dswa3$ kubectl describe ingress ingress
Name:             ingress
Labels:           <none>
Namespace:        default
Address:          192.168.49.2 #App will be server on http://192.168.49.2
Ingress Class:    nginx
Default backend:  <default>
Rules:
  Host        Path  Backends
  ----        ----  --------
  *           
              /   backend:5002 (172.17.0.9:5002)
Annotations:  <none>
Events:
  Type    Reason  Age                From                      Message
  ----    ------  ----               ----                      -------
  Normal  Sync    21m (x2 over 22m)  nginx-ingress-controller  Scheduled for sync

```

To stop the application:

```
kubectl delete -f scaler.yaml
kubectl delete -f pg_cluster.yaml
kubectl delete -f backend-deployment.yaml
kubectl delete -f backend-service.yaml
kubectl delete -f ingress.yaml
```

## Testing
To test the application you need to install k6 in order to run the scripts. In order to run the tests you need to be in the project directory with the application running. Before running the message-load-test make sure that you have posted at least one message as a user.

For main page run `k6 -e APP_URL=http://<ADDRESS_FROM_COMMAND_ABOVE>/ run index-load-test.js`
For message page run `k6 -e APP_URL=http://<ADDRESS_FROM_COMMAND_ABOVE>/ run message-load-test.js`

## Results
### Results for 10 users in a span of 10 seconds
|           |   avg  |   med  |   p(95) | p(99) |
| --------- | ------ | ------ | ------- | ----- |
| /     | 370 r/s | 27.79ms | 89.94ms | 99.06ms |
| /messages| 1176 r/s | 3.76ms | 55.2ms | 71.54ms |
### Core web vitals score (lighthouse)

| Page | Performance score |
| ----------- | --- |
| / | 100 |
| /message | 100 |
