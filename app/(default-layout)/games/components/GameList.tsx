import styles from "./GameList.module.css";
interface Props {
    games: string[];
}

export default function GameList({ games }: Props) {
    const gameList: any = []

    for(let i = 0; i < games.length; i++){
        gameList.push(<iframe src={"https://store.steampowered.com/widget/"+games[i]+"/"} frameBorder="0" width="565px" height="210"></iframe>)
    }

    return (
        <div className={styles.main}>
            {gameList}
            <div className={styles.spacer}></div>
        </div>
    );
}

