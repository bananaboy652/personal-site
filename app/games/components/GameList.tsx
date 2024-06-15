'use client'

import styles from "./GameList.module.css"
import "steamwidgets.js"
    
interface props{
    games: string[];
}

export default function GameList( { games }: props){

    const gameList: any = [];

    for(let i = 0; i < games.length; i++){
        gameList.push(<steam-app appid={games[i]} onlinecount=":count currently in-game"></steam-app>)
    }
    return(
    <div className={styles.main}>
        {gameList}
    </div>
    )
}