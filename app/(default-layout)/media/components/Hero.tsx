import styles from "./Hero.module.css"
import WorldControls from "../../components/WorldControls"

const title = "Videos and Books"

export default function Hero(){

    return(
        <div className={styles.first}>
            {/* The title block, which the world behind the page measures (data-world-title).
                On an upright screen the page's name stands alone at the top of the first
                screen, with the world's controls (Play, full screen, sound) under it.
                Everywhere else that copy of the name is not shown (it is the panel's
                heading), and the controls hang where the name would. */}
            <div className={styles.head}>
                <div className={styles.block} data-world-title>
                    <h1 className={styles.title}>{title}</h1>
                    <WorldControls />
                </div>
            </div>
            <div className={styles.main}>
                <h1>{title}</h1>
                <p>Most of my education so far at least, has not (entirely) come from any school. 
                    A lot of it has also come from the vast amount of YouTube I’ve watched, and 
                    some from the few books I’ve read. Below is a collection of most of them, a 
                    little digital library of mine.
                </p>
            </div>
        </div>
    )
}