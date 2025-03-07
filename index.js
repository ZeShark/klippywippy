const express = require('express');
const fetch = require('node-fetch');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fromStatic } = require('@aws-sdk/credential-providers');

const app = express();
const PORT = process.env.PORT || 3000;

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
const twitchUsername = process.env.TWITCH_USERNAME;

// Setup Cloudflare R2 client (AWS SDK v3)
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: fromStatic({
    accessKeyId: process.env.CF_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_SECRET_ACCESS_KEY,
  }),
});

// Main route
app.get('/', async (req, res) => {
  try {
    console.log("🔑 Getting Twitch access token...");
    const token = await getTwitchAccessToken(clientId, clientSecret);

    console.log("👤 Getting broadcaster ID...");
    const broadcasterId = await getBroadcasterId(clientId, token, twitchUsername);

    console.log("🎥 Fetching clips...");
    const clips = await getTwitchClips(clientId, token, broadcasterId);
    console.log(`🎬 Found ${clips.length} clips`);

    if (!clips.length) {
      console.log("🚫 No clips found.");
      return res.send('No clips found.');
    }

    const clip = clips[Math.floor(Math.random() * clips.length)];
    const videoUrl = clip.thumbnail_url.replace('-preview-480x272.jpg', '.mp4');
    const fileName = `${clip.id}.mp4`;

    console.log(`⬇️ Downloading clip: ${clip.title} from ${videoUrl}`);
    const videoResponse = await fetch(videoUrl);

    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoData = await videoResponse.arrayBuffer();

    console.log(`💾 Uploading ${fileName} to R2...`);
    await s3.send(new PutObjectCommand({
      Bucket: process.env.CF_BUCKET_NAME,
      Key: fileName,
      Body: Buffer.from(videoData),
      ContentType: 'video/mp4',
    }));

    console.log(`✅ Upload complete!`);
    res.send(`✅ Uploaded clip: ${fileName}`);
  } catch (err) {
    console.error(`❌ Error: ${err}`);
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Twitch Access Token
async function getTwitchAccessToken(clientId, clientSecret) {
  const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
    method: 'POST',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get token: ${data.message}`);
  return data.access_token;
}

// Twitch User ID
async function getBroadcasterId(clientId, token, username) {
  const response = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get user: ${data.message}`);
  return data.data[0].id;
}

// Twitch Clips
async function getTwitchClips(clientId, token, broadcasterId) {
  const response = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=100`, {
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get clips: ${data.message}`);
  return data.data;
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
