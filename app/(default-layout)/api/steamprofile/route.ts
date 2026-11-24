import { NextResponse } from 'next/server';

// Online status changes through the day, so this route is always run on
// request; the calls to Steam underneath are cached briefly so a burst of
// visitors does not turn into a burst of Steam API calls.
export const dynamic = 'force-dynamic';

type SteamPlayer = {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatarfull: string;
  personastate: number;
  timecreated?: number;
  gameextrainfo?: string;
};

type SummariesResponse = {
  response: { players: SteamPlayer[] };
};

export async function GET() {
  const { STEAM_API_KEY, STEAM_USER_ID } = process.env;

  if (!STEAM_API_KEY || !STEAM_USER_ID) {
    return NextResponse.json({ error: 'Steam is not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${STEAM_USER_ID}`,
      { next: { revalidate: 120 } }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch data from Steam API');
    }

    const data: SummariesResponse = await response.json();
    const player = data.response.players[0];

    if (!player) {
      throw new Error('Steam profile not found');
    }

    return NextResponse.json({
      name: player.personaname,
      avatar: player.avatarfull,
      profileUrl: player.profileurl,
      state: player.personastate,
      game: player.gameextrainfo ?? null,
      memberSince: player.timecreated ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'An unknown error occurred' }, { status: 500 });
  }
}
