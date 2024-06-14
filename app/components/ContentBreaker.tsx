import styles from "./ContentBreaker.module.css"

interface props{
    title: string;
}

export default function ContentBreaker({ title }: props) {
    return(
        <div className={styles.main}>
            <h1>{title}</h1>
            <div className={styles.breakline}/>
        </div>
    )
}