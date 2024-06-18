'use client'

import styles from './Hero.module.css';
import React, { useEffect } from 'react';

import SteamHours from './SteamHours';

export default function Hero(){

useEffect(() => {
        if (typeof window !== 'undefined') {
            import('steamwidgets.js')
                .then(module => {
                    // Initialize or use module here
                })
                .catch(error => {
                    console.error('Failed to load steamwidgets.js', error);
                });
        }
    }, []);


    return(
        <div className={styles.main}>
            <div className={styles.SteamContent}>
                <steam-user style-border="max" steamid="76561198136358808"></steam-user>
                <div className={styles.CounterText}>
                    <SteamHours />
                    <h2>And counting...</h2>
                </div>
                    <h1 className={styles.Hours}>Hours</h1>
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