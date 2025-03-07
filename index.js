require('dotenv').config();
const fetch = require('node-fetch');
const AWS = require('aws-sdk');

// Setup R2 (S3-compatible)
const r2 = new AWS.S3({
  endpoint: process.env.CF_R2_ENDPOINT,
  accessKeyId: process.env.CF_ACCESS_KEY_ID,
  secretAccessKey: process.env.CF_SECRET_ACCESS_KEY,
  signatureVersion: 'v4',
  region: 'auto'
});

async function getTwitchAccessToken() {
  const url = `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get token: ${data.message}`);
  return data.access_token;
}

async function getBroadcasterId(token) {
  const url = `https://api.twitch.tv/helix/users?login=${process.env.TWITCH_BROADCASTER_USERNAME}`;
  const res = await fetch(url, {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get user: ${data.message}`);
  return data.data[0].id;
}

async function getTwitchClips(token, broadcasterId) {
  const url = `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=100`;
  const res = await fetch(url, {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get clips: ${data.message}`);
  return data.data;
}

async function uploadToR2(filename, data) {
  return r2
    .putObject({
      Bucket: process.env.CF_BUCKET_NAME,
      Key: filename,
      Body: data,
      ContentType: 'video/mp4'
    })
    .promise();
}

async function deleteOldestIfNeeded() {
  const listedObjects = await r2
    .listObjectsV2({
      Bucket: process.env.CF_BUCKET_NAME
    })
    .promise();

  if (listedObjects.Contents.length >= 50) {
    const oldest = listedObjects.Contents.sort((a, b) => a.LastModified - b.LastModified)[0];
    await r2
      .deleteObject({
        Bucket: process.env.CF_BUCKET_NAME,
        Key: oldest.Key
      })
      .promise();
    console.log(`🗑️ Deleted oldest clip: ${oldest.Key}`);
  }
}

async function downloadAndUploadRandomClip() {
  const token = await getTwitchAccessToken();
  const broadcasterId = await getBroadcasterId(token);
  const clips = await getTwitchClips(token, broadcasterId);

  if (!clips.length) {
    console.log('🚫 No clips found.');
    return;
  }

  await deleteOldestIfNeeded();

  const clip = clips[Math.floor(Math.random() * clips.length)];
  const videoUrl = clip.thumbnail_url.replace('-preview-480x272.jpg', '.mp4');
  console.log(`⬇️ Downloading clip: ${clip.title} from ${videoUrl}`);

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);

  const videoBuffer = await videoRes.buffer();
  const filename = `${clip.id}.mp4`;

  await uploadToR2(filename, videoBuffer);
  console.log(`✅ Uploaded ${filename} to R2.`);
}

downloadAndUploadRandomClip().catch(err => {
  console.error('❌ Error:', err);
});
