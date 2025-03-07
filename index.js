const express = require('express');
const fetch = require('node-fetch');
const AWS = require('aws-sdk');

const app = express();
const port = process.env.PORT || 3000;

// 🌐 Cloudflare R2 credentials from Railway Environment Variables
const CF_ACCESS_KEY_ID = process.env.CF_ACCESS_KEY_ID;
const CF_SECRET_ACCESS_KEY = process.env.CF_SECRET_ACCESS_KEY;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_BUCKET_NAME = process.env.CF_BUCKET_NAME;
const CF_R2_REGION = 'auto';

// 🎮 Twitch credentials from Railway Environment Variables
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;

// ✅ Setup AWS S3 for R2
const s3 = new AWS.S3({
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: CF_ACCESS_KEY_ID,
  secretAccessKey: CF_SECRET_ACCESS_KEY,
  region: CF_R2_REGION,
  signatureVersion: 'v4',
});

app.get('/', async (req, res) => {
  try {
    console.log('🔑 Getting Twitch access token...');
    const token = await getTwitchAccessToken();

    console.log('👤 Getting broadcaster ID...');
    const broadcasterId = await getBroadcasterId(token);

    console.log('🎥 Fetching clips...');
    const clips = await getTwitchClips(token, broadcasterId);

    console.log(`🎬 Found ${clips.length} clips`);

    if (!clips.length) {
      console.log('🚫 No clips found.');
      return res.send('No clips found');
    }

    const clip = clips[Math.floor(Math.random() * clips.length)];
    const videoUrl = clip.thumbnail_url.replace('-preview-480x272.jpg', '.mp4');
    console.log('🎬 Clip URL:', videoUrl);

    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      console.error(`❌ Failed to download video: ${videoResponse.status}`);
      return res.status(500).send('Failed to download video');
    }

    console.log('✅ Clip downloaded');
    const videoData = await videoResponse.buffer();
    const fileName = `${clip.id}.mp4`;

    console.log(`💾 Uploading ${fileName} to R2 bucket: ${CF_BUCKET_NAME}`);
    await s3.putObject({
      Bucket: CF_BUCKET_NAME,
      Key: fileName,
      Body: videoData,
      ContentType: 'video/mp4',
    }).promise();

    console.log(`✅ Clip uploaded as ${fileName}`);
    res.send(`✅ Clip uploaded as ${fileName}`);

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).send(error.toString());
  }
});

async function getTwitchAccessToken() {
  const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, {
    method: 'POST',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get token: ${data.message}`);
  return data.access_token;
}

async function getBroadcasterId(token) {
  const response = await fetch(`https://api.twitch.tv/helix/users?login=${TWITCH_USERNAME}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok || !data.data.length) throw new Error(`Failed to get user: ${data.message}`);
  return data.data[0].id;
}

async function getTwitchClips(token, broadcasterId) {
  const response = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=100`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get clips: ${data.message}`);
  return data.data;
}

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
