'use client'

import { useEffect, useState } from "react";
import styles from "./GameList.module.css";
import "steamwidgets.js";
interface Props {
    games: string[];
}

export default function GameList({ games }: Props) {
    const [gameList, setGameList] = useState<any[]>([]);

    useEffect(() => {
        loadGamesSequentially();
    }, [games]);

    function loadGamesSequentially() {
        const loadedGames: any[] = [];
        let currentIndex = 0;

        const loadNextGame = () => {
            if (currentIndex < games.length) {
                const appId = games[currentIndex];
                const content = (
                     <iframe src={"https://store.steampowered.com/widget/"+appId+"/"} frameBorder="0" width="565px" height="210"></iframe>
                    //<steam-app appid={appId} onlinecount={onlineCount}/>
                );
                loadedGames.push(content);
                currentIndex++;
                setTimeout(loadNextGame, 0); // Adjust delay time here if needed
            } else {
                setGameList(loadedGames);
            }
        };

        loadNextGame();
    }

    return (
        <div className={styles.main}>
            {gameList}
            <div className={styles.spacer}></div>
        </div>
    );
}

