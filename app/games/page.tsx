import ContentBreaker from "../components/ContentBreaker"
import Footer from "../components/Footer"
import styles from "./page.module.css"
import Hero from "./components/Hero"
import STier from "./components/STier"

export default function games(){
    return(
        <div className={styles.main}>
            <Hero />
            <ContentBreaker title="S-Tier" subheading="The greatest of all time (in my oppinion at least...) 🐐"/>
            <STier />
            <ContentBreaker title="A-Tier" subheading="More than worth your time."/>
            <ContentBreaker title="B-Tier" subheading="If you’re even mildly interested in any of these then I say give them a go."/>
            <Footer/>
        </div>
    )
}