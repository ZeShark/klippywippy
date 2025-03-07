export default {
    async fetch(request, env, ctx) {
      console.log("🛠️ Manual test via fetch started...");
      return await main(env)
        .then(() => new Response("✅ Manual test complete!"))
        .catch((err) => new Response("❌ Error: " + err.toString(), { status: 500 }));
    },
  
    async scheduled(event, env, ctx) {
      console.log("⏰ Cron trigger started...");
      await main(env);
    },
  };
  
  async function main(env) {
    const clientId = "7dydycx5643leb53vbq343gzmcso3d"; // ✅ Replace with your own
    const clientSecret = "r89a30vf28rcynywov0b8l7q4wfi5f"; // ✅ Replace with your own
    const broadcasterUsername = "Neon_SYtW"; // ✅ Replace with your Twitch username
  
    console.log("🔑 Getting Twitch access token...");
    const token = await getTwitchAccessToken(clientId, clientSecret);
    console.log(`✅ Token received: ${token}`);
  
    console.log("👤 Getting broadcaster ID...");
    const broadcasterId = await getBroadcasterId(clientId, token, broadcasterUsername);
    console.log(`✅ Broadcaster ID: ${broadcasterId}`);
  
    console.log("🎥 Fetching clips...");
    const clips = await getTwitchClips(clientId, token, broadcasterId);
    console.log(`🎬 Found ${clips.length} clips`);
  
    if (!clips.length) {
      console.log("🚫 No clips found, stopping.");
      return;
    }
  
    const list = await env.downloader.list();
    if (list.objects.length >= 50) {
      console.log(`🗑️ Deleting oldest clip to stay under 50`);
      await env.downloader.delete(list.objects[0].key);
    }
  
    const clip = clips[Math.floor(Math.random() * clips.length)];
    const videoUrl = clip.thumbnail_url.replace("-preview-480x272.jpg", ".mp4");
    console.log(`⬇️ Downloading clip: ${clip.title} from ${videoUrl}`);
  
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
  
    const videoData = await videoResponse.arrayBuffer();
    const fileName = `${clip.id}.mp4`;
  
    console.log(`💾 Uploading clip to R2 as ${fileName}`);
    await env.downloader.put(fileName, videoData, {
      httpMetadata: { contentType: "video/mp4" },
    });
  
    console.log(`✅ Clip uploaded successfully.`);
  }
  
  async function getTwitchAccessToken(clientId, clientSecret) {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
    const response = await fetch(url, { method: "POST" });
    const data = await response.json();
    console.log("🔍 Token response:", data);
    if (!response.ok) throw new Error(`Failed to get token: ${data.message}`);
    return data.access_token;
  }
  
  async function getBroadcasterId(clientId, token, username) {
    const url = `https://api.twitch.tv/helix/users?login=${username}`;
    const response = await fetch(url, {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    console.log("🔍 Broadcaster response:", data);
    if (!response.ok || !data.data || !data.data.length) {
      throw new Error(`Failed to get user: ${data.message || "User not found"}`);
    }
    return data.data[0].id;
  }
  
  async function getTwitchClips(clientId, token, broadcasterId) {
    const url = `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=100`;
    const response = await fetch(url, {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    console.log("🔍 Clips response:", data);
    if (!response.ok) throw new Error(`Failed to get clips: ${data.message}`);
    return data.data;
  }
  