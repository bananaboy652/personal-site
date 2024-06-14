import styles from "./ToolTags.module.css"

interface props{
    tags: string[];
}

export default function({ tags }: props){
    
    const tagList = [];

    for(let i = 0; i < tags.length; i++){
        tagList.push(<h1 className={styles.TagText}>{tags[i]}</h1>)
    }

    return(
        <div className={styles.main}>
            {tagList}
        </div>
    )
}