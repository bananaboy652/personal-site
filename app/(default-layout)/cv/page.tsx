import styles from "./page.module.css"
import Content from "./components/Content"
import Footer from "../components/Footer"
import { MousePositionProvider } from "../components/MousePositionContext"

export default function CV(){
    return(
        <MousePositionProvider>
            <div className={styles.main}>
                <Content />
                <Footer />
            </div>
        </MousePositionProvider>
    )
}