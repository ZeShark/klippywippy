require('dotenv').config();
const axios = require('axios');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BROADCASTER = process.env.BROADCASTER;

async function getTwitchAccessToken() {
  const response = await axios.post(`https://id.twitch.tv/oauth2/token`, null, {
    params: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    }
  });
  return response.data.access_token;
}

async function getBroadcasterId(token) {
  const response = await axios.get(`https://api.twitch.tv/helix/users`, {
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${token}`
    },
    params: {
      login: BROADCASTER
    }
  });
  return response.data.data[0].id;
}

async function getTwitchClips(token, broadcasterId) {
  const response = await axios.get(`https://api.twitch.tv/helix/clips`, {
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${token}`
    },
    params: {
      broadcaster_id: broadcasterId,
      first: 5
    }
  });
  return response.data.data;
}

async function main() {
  try {
    console.log('🔑 Getting Twitch access token...');
    const token = await getTwitchAccessToken();

    console.log('👤 Getting broadcaster ID...');
    const broadcasterId = await getBroadcasterId(token);

    console.log('🎥 Fetching clips...');
    const clips = await getTwitchClips(token, broadcasterId);
    console.log(`🎬 Found ${clips.length} clips`);

    clips.forEach((clip) => {
      console.log(`📹 ${clip.title}: ${clip.url}`);
    });

  } catch (err) {
    console.error('❌ Error:', err.response ? err.response.data : err.message);
  }
}

main();
