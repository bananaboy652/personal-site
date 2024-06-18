import styles from "./ContentBreaker.module.css"

interface props{
    title: string;
    subheading: string;
}

export default function ContentBreaker({ title, subheading }: props) {
    return(
        <div className={styles.main}>
            <div className={styles.Heading}>
                <h1>{title}</h1>
                <div className={styles.BreakLine} />
            </div>
            <div className={styles.SubHeading}>
                {subheading != "" && <h2>{subheading}</h2>}
            </div>
        </div>
    )
}