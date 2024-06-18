import styles from "./Hero.module.css"

export default function Hero(){

    return(
        <div className={styles.main}>
            <h1>Videos and Books</h1>
            <p>Most of my education so far at least, has not (entirely) come from any school. 
                A lot of it has also come from the vast amount of YouTube I’ve watched, and 
                some from the few books I’ve read. Below is a collection of most of them, a 
                little digital library of mine.
            </p>
        </div>
    )
}