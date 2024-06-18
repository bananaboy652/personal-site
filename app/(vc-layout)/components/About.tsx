'use client'

import Link from "next/link"
import styles from "./About.module.css"

export default function About(){
    return(
        <div className={styles.main}>
            <p>
                Will is a market making trendsetter. At age 14 he became desensitised to the way of modern man after seeing the laughable way 
                people lead their lives at MIT. Since dropping out he's strived to squeeze every drop of efficiency out of his day,
                and ever since he's been shaping the world. Venture backed and exited over 14 times in 4 years, Will has been dubbed
                by many as "the grittiest man alive".
            </p>
        </div>
    )
}