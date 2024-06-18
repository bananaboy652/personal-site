// pages/api/steam.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { appID }: any = req.query;

  if (!appID) {
    return res.status(400).json({ error: 'App ID is required' });
  }

  try {
    // Fetch game details
    const gameResponse = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appID}`);
    const gameData = gameResponse.data[appID]?.data;

    // Fetch player count
    const playerCountResponse = await axios.get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appID}`);
    const playerCountData = playerCountResponse.data.response?.player_count;

    if (gameData) {
      res.status(200).json({ gameData, playerCount: playerCountData });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error fetching game data' });
  }
};

export default handler;
