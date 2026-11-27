import styles from "./Hero.module.css"

const title = "Videos and Books"

export default function Hero(){

    return(
        <div className={styles.first}>
            {/* On an upright screen the page's name stands alone at the top of the first
                screen, where the world behind the page measures it (data-world-title).
                Everywhere else this copy is not shown, and the name is the panel's heading. */}
            <div className={styles.head}>
                <h1 className={styles.title} data-world-title>{title}</h1>
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