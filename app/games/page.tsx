'use client'

import ContentBreaker from "../components/ContentBreaker"
import Footer from "../components/Footer"
import styles from "./page.module.css"
import Hero from "./components/Hero"
import GameList from "./components/GameList"
import { MousePositionProvider } from "../components/MousePositionContext";

export default function games(){
    return(
        <MousePositionProvider>
            <div className={styles.main}>
                <Hero />
                <ContentBreaker title="S-Tier" subheading="The greatest of all time (in my oppinion at least...) 🐐"/>
                <GameList games={["413150", "413150", "413150"]}/>
                <ContentBreaker title="A-Tier" subheading="More than worth your time."/>
                <GameList games={["413150", "413150", "413150"]}/>
                <ContentBreaker title="B-Tier" subheading="If you’re even mildly interested in any of these then I say give them a go."/>
                <GameList games={["413150", "413150", "413150"]}/>
                <Footer/>
            </div>
        </MousePositionProvider>
    )
}