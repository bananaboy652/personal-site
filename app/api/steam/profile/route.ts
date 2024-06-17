// pages/api/steam/profile.ts

import axios from 'axios';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    try {
      const { steamId } = req.query;
      const apiKey = process.env.STEAM_API_KEY; // Retrieve API key from environment variable

      // Steam API endpoint for getting profile summary
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`;

      // Fetch profile data from Steam API
      const response = await axios.get(url);
      const player = response.data.response.players[0];

      const profileData = {
        avatar: player.avatarfull,
        personaName: player.personaname,
        onlineState: player.personastate === 1 ? 'Online' : 'Offline',
        gameName: player.gameextrainfo || 'Not in game',
      };

      res.status(200).json(profileData);
    } catch (error) {
      console.error('Error fetching Steam profile:', error);
      res.status(500).json({ error: 'Failed to fetch Steam profile' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

export default handler;
