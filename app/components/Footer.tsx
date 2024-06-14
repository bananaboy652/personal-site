import styles from "./Footer.module.css"
import Image from "next/image"
import ContactWidget from "./ContactWidget"

export default function Footer(){
    return(
        <div className={styles.main}>
            <div className={styles.UpperContent}>
                <div className={styles.ContactContainer}>
                    <h1 className={styles.h1}>Contact me<span className={styles.Highlight}>!</span></h1>
                    <h3 className={styles.h4}>I'm never too busy for a quick chat :)</h3>
                    <div className={styles.Contact}><ContactWidget /></div>
                </div>
                <div className={styles.PagesContainer}>
                    <div className={styles.Collumn}>
                        <h2 className={styles.h2}><a href="/">✨ About me</a></h2>
                        <h2 className={styles.h2}><a href="/#project">💻 Projects</a></h2>
                        <h2 className={styles.h2}><a href="/#tools">🛠️ Tools</a></h2>
                        <h2 className={styles.h2}><a href="/#experience">🧠 Experience</a></h2>
                    </div>
                    <div className={styles.Collumn}>
                        <h2 className={styles.h2}><a href="/games">🎮 Video games</a></h2>
                        <h2 className={styles.h2}><a href="/media">🍿 Media</a></h2>
                        <h2 className={styles.h2}><a href="/cv">📄 CV</a></h2>
                    </div>
                </div>
            </div>
            <div className={styles.LowerContent}>
                <div className={styles.NoIdea}>
                    <Image 
                        src="/images/bisexualheart.png"
                        alt="bisexual heart emoji"
                        className={styles.Heart}
                        width={12}
                        height={12}
                    />
                    <h3 className={styles.h3}>I have no idea what I'm doing</h3>
                    <Image 
                        src="/images/bisexualheart.png"
                        alt="bisexual heart emoji"
                        className={styles.Heart}
                        width={20}
                        height={20}
                    />
                </div>
                <h3 className={styles.h3}>Copyright © Will Donnelly 2024, all rights reserved.</h3>
            </div>
        </div>
    )
}