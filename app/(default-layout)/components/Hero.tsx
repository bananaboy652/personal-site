'use client'

import styles from "./Hero.module.css"
import ContactWidget from "./ContactWidget"
import WorldControls from "./WorldControls"
import TypewriterText from "./TypewriterText"
import Link from "next/link"
import { useState } from "react"

export default function Hero(){

    return(
    <div className={styles.main}>
        {/* The title block. The world behind the page measures it (data-world-title)
            to know how much of the window the page's name takes up. */}
        <div className={styles.titlecard} data-world-title>
            <h1>Will Donnelly</h1>
            <div className={styles.titlecard_h2}>
                <TypewriterText text={['Hi there.', 'Greetings traveller!', 'Welcome.', 'Hello World!', 'Salutations!', 'Wassup?', 'Ciao.', 'Howdy!', 'Don\'t panic.', 'The answer is 42.', 'The cake is a lie.', 'Arise, Tarnished.', 'Praise the sun!', 'Good morning 47.', 'Buy a defuser.', 'Snake? Snake!', 'Still reading?', 'Well.', 'I hope you\'re -', 'having a nice day!']} />
            </div>
            <ContactWidget />
            {/* Play, full screen and sound: the way into the world behind the page. */}
            <WorldControls />
            {/* <Link href="/this-is-satire">
            <div className={styles.VCButton}>
                <div className={styles.VCButtonFrame}>
                    <div className={styles.VCButtonDot} />
                </div>
                <p>I am a venture capitalist</p>
            </div>
            </Link> */}
        </div>
    </div>
    )
}