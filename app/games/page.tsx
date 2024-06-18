'use client'

import ContentBreaker from "../components/ContentBreaker"
import Footer from "../components/Footer"
import Hero from "./components/Hero"
import GameList from "./components/GameList"
import { MousePositionProvider } from "../components/MousePositionContext";
import NintendoGames from "./components/NintendoGames"


const Stier = [
    '753640',  // OuterWilds
    '1245620', // Elden Ring
    '427520',  // Factorio
    '367520',  // Hollow Knight
    '271590',  // Grand Theft Auto V
    '225540',  // Just Cause 3
    '501300',  // What remains of Edith Finch
    '221910',  // The Stanley Parable
    '303210',  // The Beginner's Guide
    '1703340', // The Stanley Parable: Ultra Deluxe
    '1150690', // OMORI
    '653530',  // Return of the Obra Dinn
    '420530',  // OneShot
    '1659040', // HITMAN 3
    '400',     // Portal 2
    '620',     // Portal
    '264710',  // Subnautica
    '383870',  // Firewatch
    '782330',  // DOOM Eternal
    '620980',  // Beat Saber
    '504230',  // Celeste
    '1055540', // A Short Hike
    '391540',  // Undertale
]
        
const Atier = [
    '736260',  // Baba is You
    '730',     // Counter-Strike 2
    '1091500', // Cyberpunk 2077
    '1145360', // Hades
    '413150',  // Stardew Valley
    '1985690', // The Looker
    '814380',  // Sekiro: Shadows Die Twice
    '517630',  // Just Cause 4
    '440',     // Team Fortress 2
    '1686940', // Bobpl Battle
    '2144740', // Ghostrunner 2
    '218620',  // Payday 2
    '1237970', // Titanfall 2
    '848450',  // Subnautica: Below Zero
    '1289310', // Helltaker
    '1382070', // Viewfinder
    '638970',  // Yakuza 0
    '206190',  // Gunpoint
    '834530',  // Yakuza Kiwami
    '220',     // Half-Life 2
    '105600',  // Terraria
]

const Btier = [
    '107410',  // Arma 3
    '220200',  // Kerbal Space Program
    '362890',  // Black Mesa
    '1475810',  // Ghostwire: Tokyo
    '239030',  // Papers Please
    '252490',  // Rust
    '361420',  // Astroneer
    '1497440',  // COCOON
    '233150',  // Luftrausers
    '584400',  // Sonic Mania
    '250760',  // Shovel Knight
]

export default function Games(){
    
    return(
        // <MousePositionProvider>
            <div>
                <Hero />
                <ContentBreaker title="S-Tier" subheading="The greatest of all time (in my opinion at least...) 🐐"/>
                <GameList games={Stier}/>
                <ContentBreaker title="A-Tier" subheading="More than worth your time."/>
                <GameList games={Atier}/>
                <ContentBreaker title="B-Tier" subheading="If you’re even mildly interested in any of these then I say give them a go."/>
                <GameList games={Btier}/>
                <ContentBreaker title="Nintendo games" subheading="It's dangerous to go alone. Play these!" />
                <NintendoGames/>
                <Footer/>
            </div>
        // </MousePositionProvider>
    )
}