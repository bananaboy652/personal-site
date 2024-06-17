// utils/resolveChannelId.ts
import axios from 'axios';

const resolveChannelId = async (url: string) => {
    const urlParts = url.split('/');
    const identifier = urlParts[urlParts.length - 1];

    if (identifier.startsWith('@')) {
        const { data } = await axios.get(
            `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${identifier.slice(1)}&key=${process.env.YOUTUBE_API_KEY}`
        );
        return data.items[0].id;
    }

    return identifier;
};

export default resolveChannelId;
