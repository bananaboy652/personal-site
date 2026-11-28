import React, { useEffect, useState } from 'react';
import axios from 'axios'
import styles from './YouTubeChannels.module.css';
import { LinkPreview } from '@/app/(default-layout)/components/link-preview';

interface YouTubeChannelsProps {
  channelIds: string[];
}

interface ChannelData {
  channelId: string;
  channelName: string;
  channelImage: string;
}

const API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

const YouTubeChannels: React.FC<YouTubeChannelsProps> = ({ channelIds }) => {
  const [channelsData, setChannelsData] = useState<ChannelData[]>([]);

  useEffect(() => {
    const fetchChannelData = async () => {
      const fetchedData: ChannelData[] = [];

      await Promise.all(
        channelIds.map(async (channelId) => {
          try {
            const channelResponse = await axios.get(
              `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${API_KEY}`
            );

            // A channel that has gone (or an ID that never was one) comes back with no
            // `items` at all, not an empty list. Either way there is nothing to show: skip it.
            const channel = channelResponse.data?.items?.[0];
            if (!channel?.snippet) return;

            const channelData: ChannelData = {
              channelId: channelId,
              channelName: channel.snippet.title,
              channelImage: channel.snippet.thumbnails?.default?.url ?? '',
            };
            
            fetchedData.push(channelData);
          } catch {
            // The request itself failed (offline, quota, a blocked key): leave this channel out.
          }
        })
      );

      // Sort fetched data based on the order of channelIds
      const sortedData = channelIds.map((id) => fetchedData.find((item) => item?.channelId === id));
      setChannelsData(sortedData.filter(Boolean) as ChannelData[]);
    };

    fetchChannelData();
  }, [channelIds]);

  const openChannelPage = (channelId: string) => {
    window.open(`https://www.youtube.com/channel/${channelId}`, '_blank');
  };

  return (
    <div className={styles.main}>
      {channelsData.map((channel, index) => (
        <div key={index} className={styles.channel}>
          <LinkPreview url={`https://www.youtube.com/channel/${channel.channelId}`}>
            <img className={styles.Icon} src={channel.channelImage} alt={`${channel.channelName} profile`} />
          </LinkPreview>
          <LinkPreview className={styles.Link} url={`https://www.youtube.com/channel/${channel.channelId}`}><h3>{channel.channelName}</h3></LinkPreview>
        </div>
      ))}
      <div className={styles.Spacer}></div>
    </div>
  );
};

export default YouTubeChannels;
