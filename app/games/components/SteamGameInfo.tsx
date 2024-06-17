// components/SteamGameInfo.tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface SteamGameInfoProps {
  appID: string;
}

interface GameData {
  name: string;
  header_image: string;
  short_description: string;
}

const SteamGameInfo: React.FC<SteamGameInfoProps> = ({ appID }) => {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGameData = async () => {
      try {
        // Fetch game details and player count from the serverless function
        const response = await axios.get(`../../../api/steam?appID=${appID}`);
        const { gameData, playerCount } = response.data;

        setGameData({
          name: gameData.name,
          header_image: gameData.header_image,
          short_description: gameData.short_description,
        });
        setPlayerCount(playerCount);
      } catch (err) {
        setError('Error fetching game data');
      }
    };

    fetchGameData();
  }, [appID]);

  if (error) {
    return <div>{error}</div>;
  }

  if (!gameData) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>{gameData.name}</h1>
      <img src={gameData.header_image} alt={gameData.name} />
      <p>{gameData.short_description}</p>
      <a href={`https://store.steampowered.com/app/${appID}`} target="_blank" rel="noopener noreferrer">Buy Now</a>
      {playerCount !== null && <p>Active Players: {playerCount}</p>}
    </div>
  );
};

export default SteamGameInfo;
