import styles from "./InfoPill.module.css"
import { LinkPreview } from "./link-preview"

export default function infoPill(){

    const currentDate = new Date()

    const extraYear = ((currentDate.getDate() > 11) || (currentDate.getMonth() > 0)) ? 0:-1
    const age = (currentDate.getFullYear()-2005) + extraYear

    return(
    <div className={styles.main}>
        <h3 className={styles.main_h3}>🚀 Founder at <span className="Link"><LinkPreview url="https://induct.ie" className="Link">Induct</LinkPreview></span></h3>
        <h3 className={styles.main_h3}>🛠️ Engineer & Developer</h3>
        <h3 className={styles.main_h3}>🎓 Trinity College Dublin</h3>
        <h3 className={styles.main_h3}>⏰ {age} years old</h3>
        <h3 className={styles.main_h3}>☘️ Irish citizen</h3>
        <h3 className={styles.main_h3}>🏡 Dublin city</h3>
    </div>
    )
}
