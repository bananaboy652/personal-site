'use client'

import styles from "./About.module.css"
import { LinkPreview } from "./link-preview";
import ContactWidget from "./ContactWidget";

export default function About(){
    return(
        <div className={styles.main}>
            <p>
                An initiative-taking and hardworking individual, studying engineering with management at Trinity College Dublin. 
                I have extensive hobbies in 3D printing, computer programming, and electrical engineering, I spend most of my 
                spare time making stuff. Currently a Founder working at&nbsp;
                <LinkPreview
                    url="https://induct.ie"
                    className="Link"
                >
                    Induct
                </LinkPreview> a tech start-up focused on access management. 
            </p>
        </div>
    )
}