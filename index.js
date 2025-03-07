import express from 'express';
import AWS from 'aws-sdk';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

// Twitch API credentials
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const BROADCASTER_USERNAME = process.env.TWITCH_USERNAME;

// Cloudflare R2 config
const r2 = new AWS.S3({
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.CF_ACCESS_KEY_ID,
  secretAccessKey: process.env.CF_SECRET_ACCESS_KEY,
  signatureVersion: 'v4',
  region: 'auto',
});

// Upload file to R2
async function uploadToR2(fileName, fileBuffer, contentType) {
  return r2
    .putObject({
      Bucket: process.env.CF_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: contentType,
    })
    .promise();
}

// List objects in R2 bucket
async function listR2Objects() {
  const result = await r2
    .listObjectsV2({
      Bucket: process.env.CF_BUCKET_NAME,
    })
    .promise();
  return result.Contents || [];
}

// Delete object from R2
async function deleteFromR2(key) {
  await r2
    .deleteObject({
      Bucket: process.env.CF_BUCKET_NAME,
      Key: key,
    })
    .promise();
}

// Get Twitch Access Token
async function getTwitchAccessToken() {
  const url = `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`;
  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get token: ${data.message}`);
  return data.access_token;
}

// Get Broadcaster ID
async function getBroadcasterId(token) {
  const url = `https://api.twitch.tv/helix/users?login=${BROADCASTER_USERNAME}`;
  const response = await fetch(url, {
    headers: {
      'Client-ID': CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get user: ${data.message}`);
  return data.data[0].id;
}

// Get Clips
async function getTwitchClips(token, broadcasterId) {
  const url = `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=100`;
  const response = await fetch(url, {
    headers: {
      'Client-ID': CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get clips: ${data.message}`);
  return data.data;
}

// Download and upload random clip
async function downloadAndUploadRandomClip() {
  const token = await getTwitchAccessToken();
  const broadcasterId = await getBroadcasterId(token);
  const clips = await getTwitchClips(token, broadcasterId);

  if (!clips.length) throw new Error('No clips found.');

  const clip = clips[Math.floor(Math.random() * clips.length)];
  const videoUrl = clip.thumbnail_url.replace('-preview-480x272.jpg', '.mp4');
  const fileName = `${clip.id}.mp4`;

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);

  const videoBuffer = await videoResponse.buffer();
  await uploadToR2(fileName, videoBuffer, 'video/mp4');
  console.log(`✅ Uploaded clip: ${fileName}`);

  // Auto delete if more than 50 clips
  const objects = await listR2Objects();
  if (objects.length > 50) {
    const oldest = objects.sort((a, b) => a.LastModified - b.LastModified)[0];
    await deleteFromR2(oldest.Key);
    console.log(`🗑️ Deleted oldest clip: ${oldest.Key}`);
  }
}

app.get('/fetch-clip', async (req, res) => {
  try {
    await downloadAndUploadRandomClip();
    res.send('✅ Clip fetched and uploaded to R2!');
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).send(`❌ Failed: ${err.message}`);
  }
});

app.get('/', (req, res) => {
  res.send('🚀 Twitch Clip Downloader with Cloudflare R2!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
