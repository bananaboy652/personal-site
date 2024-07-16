'use client'

import styles from "./Hero.module.css"
import ContactWidget from "./ContactWidget"
import InfoPill from "./InfoPill"
import TypewriterText from "./TypewriterText"
import Link from "next/link"
import { useState } from "react"

export default function Hero(){

    return(
    <div className={styles.main}>
        <div className={styles.profile}>
            <img
                className={styles.img}
                src="/images/profile.png"
                alt="Profile Picture"
                width={240}
                height={240}
            />
            <h3>( ^ I'm this idiot ^ )</h3>
        </div>
        <div className={styles.titlecard}>
            <h1>Will Donnelly</h1>
            <div className={styles.titlecard_h2}>
                <TypewriterText text={['Hi there.', 'Greetings traveller!', 'Welcome.', 'Hello World!', 'Salutations!', 'Wassup?', 'Ciao.', 'Howdy!', 'Don\'t panic.', 'The answer is 42.', 'The cake is a lie.', 'Arise, Tarnished.', 'Praise the sun!', 'Good morning 47.', 'Buy a defuser.', 'Snake? Snake!', 'Still reading?', 'Well.', 'I hope you\'re -', 'having a nice day!']} />
            </div>
            <ContactWidget />
            {/* <Link href="/this-is-satire">
            <div className={styles.VCButton}>
                <div className={styles.VCButtonFrame}>
                    <div className={styles.VCButtonDot} />
                </div>
                <p>I am a venture capitalist</p>
            </div>
            </Link> */}
        </div>
        <InfoPill />
    </div>
    )
}