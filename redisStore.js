const dotenv = require('dotenv')
const createClient = require('redis').createClient

dotenv.config()
const redisClient = createClient(process.env.REDIS_URL);

redisClient.on('error', err => {
  console.error('Redis error', err);
});

exports.setData = (data, key) => {
  return new Promise((resolve, reject) => {
    redisClient.set(key, JSON.stringify(data), (err, res) => {
      if (err) {
        reject('Fail to save data with key: ' + key + '.' + err);
      } else {
        resolve();
      }
    });
  });
}

exports.getData = (key) => {
  return new Promise((resolve, reject) => {
    redisClient.get(key, (err, res) => {
      if (err) {
        reject(err)
        return
      }
      if (!res) {
        reject('no found')
        return
      }
      resolve(JSON.parse(res + ''));
    });
  });
}
