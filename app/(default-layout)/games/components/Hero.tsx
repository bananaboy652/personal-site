'use client'

import styles from './Hero.module.css';
import React from 'react';

import SteamHours from './SteamHours';
import SteamProfileCard from './SteamProfileCard';
import WorldControls from '../../components/WorldControls';

export default function Hero(){

    return(
        <div className={styles.main}>
            <div className={styles.SteamContent}>
                <SteamProfileCard steamid="76561198136358808" />
                <div className={styles.Counter}>
                    {/* The page's title block. The world behind the page measures it (data-world-title). */}
                    <div data-world-title>
                        <div className={styles.CounterLine}>
                            <SteamHours />
                            <h1 className={styles.Hours}>Hours</h1>
                        </div>
                        <h2>And counting...</h2>
                        {/* Play, full screen and sound: the way into the world behind the page. */}
                        <WorldControls />
                    </div>
                </div>
            </div>
            <div className={styles.PageDescription}>
                <h1>My Favourite Games</h1>
                <p>I probably play far far far too many games, but to me they are the highest art form.
                    Below is a tier list of some of my favourites. If you have any interest in gaming at all,
                    then I strongly recommend each and every game on this list. Most of these can be found on
                    Steam, but I recommend the Ryujinx/Dolphin emulators for those made by Nintendo.
                </p>
            </div>
        </div>
    )
}
