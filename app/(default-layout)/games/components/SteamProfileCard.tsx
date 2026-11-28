'use client'

import { useEffect, useState } from 'react';
import styles from './SteamProfileCard.module.css';

/* Replaces the <steam-user> widget from steamwidgets.js, whose package and
   hosted service no longer exist. Same contents as that card (avatar, name,
   "Member since", online status, a button to the profile), read from Steam
   through this site's own /api/steamprofile route. */

type SteamProfile = {
  name: string;
  avatar: string;
  profileUrl: string;
  state: number;
  game: string | null;
  memberSince: number | null;
};

// Steam's personastate values.
const STATES = ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to trade', 'Looking to play'];

function memberSince(timestamp: number) {
  const date = new Date(timestamp * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `Member since: ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function SteamProfileCard({ steamid }: { steamid: string }) {
  const [profile, setProfile] = useState<SteamProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      try {
        const response = await fetch('/api/steamprofile');
        if (!response.ok) {
          throw new Error('Failed to fetch Steam profile');
        }
        const data: SteamProfile = await response.json();
        if (!cancelled) setProfile(data);
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'An unknown error occurred');
        if (!cancelled) setFailed(true);
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  const profileUrl = profile?.profileUrl ?? `https://steamcommunity.com/profiles/${steamid}/`;

  let statusText = failed ? 'Unavailable' : 'Loading';
  let statusClass = styles.offline;
  if (profile) {
    if (profile.game) {
      statusText = `In-game: ${profile.game}`;
      statusClass = styles.online;
    } else {
      statusText = STATES[profile.state] ?? 'Offline';
      statusClass = profile.state === 0 ? styles.offline : (profile.state === 3 || profile.state === 4) ? styles.away : styles.online;
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.avatarWell}>
        {profile
          ? <img className={styles.avatar} src={profile.avatar} alt="Steam avatar" width={64} height={64} />
          : <div className={styles.avatar} />}
      </div>

      <div className={styles.text}>
        <div className={styles.name}>{profile ? profile.name : 'Steam profile'}</div>
        <div className={styles.slogan}>
          {profile?.memberSince ? memberSince(profile.memberSince) : 'Steam'}
        </div>
      </div>

      <div className={styles.side}>
        <div className={`${styles.status} ${statusClass}`} title={statusText}>
          <span className={styles.led} />
          <span className={styles.statusText}>{statusText}</span>
        </div>
        <a className={styles.view} href={profileUrl} target="_blank" rel="noopener noreferrer">
          View profile
        </a>
      </div>
    </div>
  );
}
