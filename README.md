# Glip Bot Boilerplate

A [Glip](https://glip.com/) News bot with Dialogflow. Deployed on heroku.

## Dependences

* Node.js
* Dialogflow(API.AI)
* Bing Search API
* Heroku

## Setup

### 1. Create a Glip Bot on [RingCentral developer website](https://developer.ringcentral.com/)

### 2. Create a heroku app using this project

```
$ git clone https://github.com/dongyu666/Abot.git
$ cd Abot
$ npm install -g heroku
$ heroku login
$ heroku create your_news_app_id
```

### 3. Set environment params in heroku app setting

```
GLIP_API_SERVER=https://platform.devtest.ringcentral.com
GLIP_CLIENT_ID=rc-glip-app-client-id
GLIP_CLIENT_SECRET=rc-glip-app-client-secret
GLIP_BOT_SERVER=https://your_news_app_id.herokuapp.com
GLIP_BOT_VERIFICATION_TOKEN=bot-webhook-verification-token-in-rc-platform
BING_NEWS_KEY=bind_news_key
API_AI_TOKEN=your_api_ai_key
```

### 4. Update redirect uri in [RingCentral developer website](https://developer.ringcentral.com/) with:

```
https://your_news_app_id.herokuapp.com/oauth
```

### 5. Update webhook uri in [RingCentral developer website](https://developer.ringcentral.com/) with:

```
https://your_news_app_id.herokuapp.com/webhook

```

5. Restart your bot

