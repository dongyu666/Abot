const dotenv = require('dotenv')
const express = require('express')
const RingCentral = require('ringcentral')
const fs = require('fs')
const path = require('path')
const request = require('urllib').request
const bodyParser = require('body-parser')
const redis = require('./redisStore')
const pkg = require('./package.json')

dotenv.config()
const tokenFile = path.join(__dirname, '.token')
const rcsdk = new RingCentral({
  appKey: process.env.GLIP_CLIENT_ID,
  appSecret: process.env.GLIP_CLIENT_SECRET,
  server: process.env.GLIP_API_SERVER
})
const platform = rcsdk.platform()

redis.getData('rc-oauth-token').then((data) => {
  platform.auth().setData(data)
}).catch(() => {
  console.log('token not found')
})

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
  if (entity) {
    url = url + "&category=" + entity
  }
  const response = await request(url, {
    dataType: 'json',
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.BING_NEWS_KEY
    }
  })
  console.log(response.data)
  if (response.status === 200) {
    const news = response.data.value || []
    console.log(news[0])
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
  console.log(response.data)
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
  console.log(response.data)
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
  news.forEach((n) => {
    console.log(JSON.stringify(n, null, 2))
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
  return attachments
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

async function handleGlipMessage(message) {
  if (!message) {
    return
  }
  if (message.type === 'TextMessage') {
    console.log(message.text)
    if (message.text === 'ping') {
      await sendGlipMessage({groupId: message.groupId, text: 'pong' })
    } else if (message.text.startsWith('top news')) {
      const { news, link } = await getTopNews()
      await sendNewsToGlip({
        groupId: message.groupId,
        text: `[top news](${link})`,
        news
      })
    } else if (message.text.startsWith('trending topics')) {
      const { news, link } = await getTrendingNews()
      await sendNewsToGlip({
        groupId: message.groupId,
        text: 'Trending topics:',
        news
      })
    } else if (message.text.startsWith('search news ')) {
      const query = message.text.replace('search news ', '')
      const { news, link } = await searchNews(query)
      await sendNewsToGlip({
        groupId: message.groupId,
        text: `[Related News >](${link})`,
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
