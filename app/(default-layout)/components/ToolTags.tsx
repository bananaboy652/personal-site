import styles from "./ToolTags.module.css"

interface props{
    tags: string[];
    /** extra class for the row, for a place that wants it laid out differently from a project card */
    className?: string;
}

export default function ToolTags({ tags, className }: props){
    
    const tagList = [];

    for(let i = 0; i < tags.length; i++){
        tagList.push(<h1 className={styles.TagText} key={i}>{tags[i]}</h1>)
    }

    return(
        <div className={className ? `${styles.main} ${className}` : styles.main}>
            {tagList}
        </div>
    )
}