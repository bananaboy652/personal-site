import React, { useEffect, useState } from 'react';

type YouTubeChannelData = {
  id: string;
  name: string;
  profileImageUrl?: string;
  recentVideo?: {
    title: string;
    videoUrl: string;
  };
  channelUrl: string;
};

type YouTubeChannelsProps = {
  channelIds: string[];
};

const YouTubeChannels: React.FC<YouTubeChannelsProps> = ({ channelIds }) => {
  const [channels, setChannels] = useState<YouTubeChannelData[]>([]);

  useEffect(() => {
    const fetchChannelData = async (channelId: string) => {
      try {
        const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
        
        // Fetch the channel details
        const channelResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`
        );
        const channelData = await channelResponse.json();

        if (!channelResponse.ok || !channelData.items || channelData.items.length === 0) {
          throw new Error(`Failed to fetch data for channel ID: ${channelId}`);
        }

        const channelInfo = channelData.items[0].snippet;
        const channelName = channelInfo.title;

        try {
          // Fetch the most recent video
          const response = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=1&order=date&type=video&key=${apiKey}`
          );
          const data = await response.json();

          if (!response.ok || !data.items || data.items.length === 0) {
            throw new Error(`Failed to fetch data for channel ID: ${channelId}`);
          }

          const videoInfo = data.items[0].snippet;

          setChannels((prevChannels) => [
            ...prevChannels,
            {
              id: channelId,
              name: channelName,
              profileImageUrl: channelInfo.thumbnails.high.url,
              recentVideo: {
                title: videoInfo.title,
                videoUrl: `https://www.youtube.com/watch?v=${data.items[0].id.videoId}`,
              },
              channelUrl: `https://www.youtube.com/channel/${channelId}`
            },
          ]);
        } catch (videoError) {
          console.error(videoError instanceof Error ? videoError.message : 'An unknown error occurred while fetching the recent video');
          setChannels((prevChannels) => [
            ...prevChannels,
            {
              id: channelId,
              name: channelName,
              channelUrl: `https://www.youtube.com/channel/${channelId}`
            },
          ]);
        }
      } catch (channelError) {
        console.error(channelError instanceof Error ? channelError.message : 'An unknown error occurred while fetching the channel details');
      }
    };

    channelIds.forEach((id) => {
      fetchChannelData(id);
    });
  }, [channelIds]);

  return (
    <div>
      {channels.map((channel) => (
        <div key={channel.id} style={{ marginBottom: '20px' }}>
          <h2>{channel.name}</h2>
          {channel.profileImageUrl && (
            <img
              src={channel.profileImageUrl}
              alt={`${channel.name} profile`}
              style={{ width: '100px', height: '100px' }}
            />
          )}
          {channel.recentVideo ? (
            <>
              <h3>Recent Video: {channel.recentVideo.title}</h3>
              <a href={channel.recentVideo.videoUrl} target="_blank" rel="noopener noreferrer">
                Watch Video
              </a>
            </>
          ) : (
            <a href={channel.channelUrl} target="_blank" rel="noopener noreferrer">
              Visit Channel
            </a>
          )}
        </div>
      ))}
    </div>
  );
};

export default YouTubeChannels;
