// pages/api/youtube.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { getCachedData, setCachedData } from '../../../utils/cache';
import allowCors from '../../../utils/cors';

const fetchYouTubeData = async (channelId: string, apiKey: string) => {
  const cacheKey = `channel_${channelId}`;
  const cachedData = getCachedData(cacheKey);

  if (cachedData) {
    console.log('Using cache for channel:', channelId);
    return cachedData;
  }

  try {
    console.log('Using YouTube API for channel:', channelId);
    const channelRes = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`
    );
    if (!channelRes.data.items || channelRes.data.items.length === 0) {
      throw new Error('Channel not found');
    }
    const channelData = channelRes.data.items[0].snippet;

    const videoRes = await axios.get(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=1&order=date&type=video&key=${apiKey}`
    );
    if (!videoRes.data.items || videoRes.data.items.length === 0) {
      throw new Error('Video not found');
    }
    const latestVideo = videoRes.data.items[0].snippet;
    const latestVideoId = videoRes.data.items[0].id.videoId;

    const channelInfo = {
      iconUrl: channelData.thumbnails.default.url,
      name: channelData.title,
      latestVideoTitle: latestVideo.title,
      latestVideoEmbedUrl: `https://www.youtube.com/embed/${latestVideoId}`,
    };

    setCachedData(cacheKey, channelInfo);
    return channelInfo;
  } catch (error) {
    console.error('Error fetching data from YouTube API', error);
    throw error;
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { channelIds } = req.query;
  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

  if (!channelIds || !apiKey) {
    return res.status(400).json({ error: 'Missing channelIds or apiKey' });
  }

  const channelIdsArray = (channelIds as string).split(',');

  try {
    const channelDataPromises = channelIdsArray.map((channelId) => fetchYouTubeData(channelId, apiKey));
    const channelData = await Promise.all(channelDataPromises);
    res.status(200).json(channelData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channel data' });
  }
};

export default allowCors(handler);
