import { NextRequest, NextResponse } from 'next/server';

type SteamGame = {
  playtime_forever: number;
};

type SteamResponse = {
  response: {
    games: SteamGame[];
  };
};

export async function GET(req: NextRequest) {
  const { STEAM_API_KEY, STEAM_USER_ID } = process.env;

  try {
    const response = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${STEAM_USER_ID}&include_appinfo=true`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch data from Steam API');
    }

    const data: SteamResponse = await response.json();
    const games = data.response.games;
    const totalHours = games.reduce((acc, game) => acc + game.playtime_forever, 0) / 60;

    return NextResponse.json({ totalHours });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'An unknown error occurred' }, { status: 500 });
  }
}
