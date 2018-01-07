const dotenv = require('dotenv')
const ApiAi = require('apiai');

dotenv.config()
const ai = ApiAi(process.env.API_AI_TOKEN)

const sendMessage = (text, sessionId) => {
  return new Promise((resolve, reject) => {
    const request = ai.textRequest(text, { sessionId });
    request.on('response', (response) => {
      resolve(response);
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.end();
  });
}

exports.send = async (text, sessionId) => {
  try {
    const response = await sendMessage(text, sessionId);
    return response
  } catch (e) {
    console.error(e);
    return null;
  }
}
