const dotenv = require('dotenv')
const express = require('express')
const RingCentral = require('ringcentral')
const fs = require('fs')
const path = require('path')
const request = require('urllib').request
const bodyParser = require('body-parser')
const redis = require('./redisStore')
const apiAi = require('./apiAi')
const pkg = require('./package.json')

dotenv.config()
const tokenFile = path.join(__dirname, '.token')
const rcsdk = new RingCentral({
  appKey: process.env.GLIP_CLIENT_ID,
  appSecret: process.env.GLIP_CLIENT_SECRET,
  server: process.env.GLIP_API_SERVER
})
const platform = rcsdk.platform()
let currentPerson = {};
async function init() {
  try {
    const tokenData = await redis.getData('rc-oauth-token')
    if (!tokenData) {
      return
    }
    platform.auth().setData(tokenData)
    const personResponse = await platform.get('/glip/persons/~')
    currentPerson = personResponse.json()
  } catch (e) {
    console.log(e)
    console.log('token not found')
  }
}

init()

const app = express()
app.use(bodyParser.json())

app.get('/', async (req, res) => {
  res.send('Hi, Bot is working!')
});

app.get('/oauth', async (req, res) => {
  if(!req.query.code){
    res.status(500);
    res.send({"Error": "Looks like we're not getting code."});
    console.log("Looks like we're not getting code.");
    return;
  }
  console.log('starting oauth with code...');
  try {
    const authResponse = await platform.login({
      code: req.query.code,
      redirectUri: `${process.env.GLIP_BOT_SERVER}/oauth`
    });
    const data = authResponse.json();
    await redis.setData(data, 'rc-oauth-token')
    const personResponse = await platform.get('/glip/persons/~')
    currentPerson = personResponse.json()
    console.log('oauth successfully.');
  } catch (e) {
    console.log('oauth error:');
    console.error(e)
  }
  res.send('ok')
})

async function getTopNews(entity) {
  let url = "https://api.cognitive.microsoft.com/bing/v7.0/news/?"
      + "count=5&mkt=en-US&originalImg=true";
  if (entity && entity.length > 0) {
    url = url + "&category=" + entity
  }
  const response = await request(url, {
    dataType: 'json',
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.BING_NEWS_KEY
    }
  })
  console.log(response)
  if (response.status === 200) {
    const news = response.data.value || []
    return { news, link: response.data.webSearchUrl }
  }
  return { news: [] }
}

async function searchNews(query) {
  const url = "https://api.cognitive.microsoft.com/bing/v7.0/news/search?q=" +
    query + "&count=5&mkt=en-us&originalImg=true";
  const response = await request(url, {
    dataType: 'json',
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.BING_NEWS_KEY
    }
  })
  if (response.status === 200) {
    const news = response.data.value || []
    console.log(news[0])
    return { news, link: response.data.readLink }
  }
  return { news: [] }
}

async function getTrendingNews() {
  const url = "https://api.cognitive.microsoft.com/bing/v7.0/news/trendingtopics?mkt=en-us&count=5";
  console.log(url)
  const response = await request(url, {
    dataType: 'json',
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.BING_NEWS_KEY
    }
  })
  if (response.status === 200) {
    const news = response.data.value || []
    console.log(news[0])
    return { news, link: response.data.webSearchUrl || response.data.readLink }
  }
  return { news: [] }
}

async function sendGlipMessage({ groupId, text, attachments }) {
  try {
    await platform.post('/glip/posts', { groupId, text, attachments })
  } catch (e) {
    console.error(e)
  }
}

function formatNewsToMessages(news) {
  const attachments = []
  console.log(JSON.stringify(news && news[0], null, 2))
  news.forEach((n) => {
    attachments.push({
      type: 'Card',
      fallback: `[${n.name}](${n.url || n.webSearchUrl || n.readLink})`,
      text: n.description,
      imageUri: n.image && (n.image.contentUrl || n.image.url),
      author: {
        name: n.name,
        uri: n.url
      },
      footnote: {
        time: n.datePublished
      }
    })
  })
  return attachments.slice(0, 5)
}

async function sendNewsToGlip({
  news,
  groupId,
  text
}) {
  try {
    const attachments = formatNewsToMessages(news)
    await sendGlipMessage({ groupId, text, attachments })
    console.log('send to', groupId, 'successfully.')
  } catch (e) {
    console.error(e)
  }
}

let latestText = ''

async function handleGlipMessage(message) {
  if (!message) {
    return
  }
  if (message.creatorId === currentPerson.id) {
    return
  }
  if (message.type === 'TextMessage') {
    console.log('message from glip:', message.text)
    // if (latestText === message.text) {
    //   return
    // }
    if (message.text === 'ping') {
      latestText = 'pong'
      await sendGlipMessage({ groupId: message.groupId, text: 'pong' })
      return
    }
    const aiRes = await apiAi.send(message.text, message.groupId)
    if (!aiRes || !aiRes.result) {
      return
    }
    console.log(aiRes.result.action)
    console.log(aiRes.result.parameters)
    if (aiRes.result.action === 'search_news') {
      const query = aiRes.result.parameters && aiRes.result.parameters.any
      const { news } = await searchNews(query)
      if (query) {
        latestText = `Related News about ${query}:`
      } else {
        latestText = 'Related News'
      }
      await sendNewsToGlip({
        groupId: message.groupId,
        text: latestText,
        news
      })
      return
    }

    if (aiRes.result.action === 'top_news') {
      const query = aiRes.result.parameters && aiRes.result.parameters.any
      const { news, link } = await getTopNews(query)
      latestText = `[Current Top News:](${link})`
      await sendNewsToGlip({
        groupId: message.groupId,
        text: `[Current Top News:](${link})`,
        news
      })
      return
    }
    if (aiRes.result.action === 'trending_topics') {
      const { news } = await getTrendingNews()
      latestText = 'Trending topics:'
      await sendNewsToGlip({
        groupId: message.groupId,
        text: 'Trending topics:',
        news
      })
    }
  }
}

app.post('/webhook', async (req, res) => {
  console.log('WebHook Request:')
  const verificationToken = req.get('verification-token')
  if (verificationToken !== process.env.GLIP_BOT_VERIFICATION_TOKEN) {
    res.status(400)
    res.send({ "Error": "Bad Request." })
    console.error(req.body)
    return
  }
  const message = req.body.body
  const validationToken = req.get('validation-token')
  handleGlipMessage(message)
  if (validationToken) {
    res.set('validation-token', req.get('validation-token'))
  }
  res.send('ok')
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
