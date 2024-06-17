// utils/fetchYouTubeData.ts
import axios from 'axios';

const API_KEY = process.env.YOUTUBE_API_KEY; // Ensure you set this in your environment variables

const fetchYouTubeData = async (channelId: string) => {
    const { data } = await axios.get(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&id=${channelId}&key=${API_KEY}`
    );
    
    const channel = data.items[0];
    const latestVideoId = await fetchLatestVideoId(channelId);
    const latestVideoTitle = await fetchLatestVideoTitle(latestVideoId);

    return {
        name: channel.snippet.title,
        icon: channel.snippet.thumbnails.default.url,
        latestVideo: latestVideoId,
        latestVideoTitle
    };
};

const fetchLatestVideoId = async (channelId: string) => {
    const { data } = await axios.get(
        `https://www.googleapis.com/youtube/v3/search?order=date&part=snippet&channelId=${channelId}&maxResults=1&key=${API_KEY}`
    );
    return data.items[0].id.videoId;
};

const fetchLatestVideoTitle = async (videoId: string) => {
    const { data } = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`
    );
    return data.items[0].snippet.title;
};

export default fetchYouTubeData;
