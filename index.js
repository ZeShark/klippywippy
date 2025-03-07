const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", async (req, res) => {
  try {
    await main();
    res.send("✅ Manual test complete!");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error: " + err.toString());
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Your main logic
async function main() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const broadcasterUsername = process.env.TWITCH_BROADCASTER_USERNAME;

  console.log("🔑 Getting Twitch access token...");
  const token = await getTwitchAccessToken(clientId, clientSecret);
  console.log(`✅ Token received: ${token}`);

  console.log("👤 Getting broadcaster ID...");
  const broadcasterId = await getBroadcasterId(clientId, token, broadcasterUsername);
  console.log(`✅ Broadcaster ID: ${broadcasterId}`);

  console.log("🎥 Fetching clips...");
  const clips = await getTwitchClips(clientId, token, broadcasterId);
  console.log(`🎬 Found ${clips.length} clips`);
}

async function getTwitchAccessToken(clientId, clientSecret) {
  const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get token: ${data.message}`);
  return data.access_token;
}

async function getBroadcasterId(clientId, token, username) {
  const response = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok || !data.data || !data.data.length) {
    throw new Error(`Failed to get user: ${data.message || "User not found"}`);
  }
  return data.data[0].id;
}

async function getTwitchClips(clientId, token, broadcasterId) {
  const response = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=100`, {
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Failed to get clips: ${data.message}`);
  return data.data;
}
