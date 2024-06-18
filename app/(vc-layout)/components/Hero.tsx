'use client'

import styles from "./Hero.module.css"
import TypewriterText from "./TypewriterText"
import Link from "next/link"
import { useState } from "react"

export default function Hero(){

    return(
    <div className={styles.main}>
        <div className={styles.profile}>
            <img
                className={styles.img}
                src="/images/profile-vc.png"
                alt="Profile Picture"
                width={240}
                height={240}
            />
            <h3>( ^ I'm better than you. ^ )</h3>
        </div>
        <div className={styles.titlecard}>
            <h1>Will Donnelly</h1>
            <div className={styles.titlecard_h2}>
                <TypewriterText text={['Renegade Deeptech Hacker.', 'Neural Network Whisperer.', 'Unicorn Bootloader.', 'Mad Scientist Dropout.', 'Slayer of Inefficiencies.', 'Industy Building Trendsetter.', 'Steve Jobs\' 2nd Coming.', 'Blockchain Evangelist.', 'Daring Disruptor.', 'World\'s First 25x Developer.', 'Defiant Independant Outlier.', 'AGI\'s Control Group.', 'Magic Market Maker.', 'Fifteenth-time Founder.', 'Influencer of The Cosmos.', 'Machine Learning Messiah.', 'Real-time Rockstar.', 'Revolutionary Entreprenurial Mastermind.', 'Grittiest Man Alive.', 'Habitual Life Changer.']} />
            </div>
            <Link href="/">
            <div className={styles.VCButton}>
                <div className={styles.VCButtonFrame}>
                    <div className={styles.VCButtonDot} />
                </div>
                <p>I am a venture capitalist</p>
            </div>
            </Link>
        </div>
    </div>
    )
}