'use client'

import styles from "./ExperiencePill.module.css"
import { LinkPreview } from "./link-preview"
import { useState } from "react"

export default function ExperiencePill(){
    return(
        <div className={styles.main}>
            <h1 className={styles.Heading}>🚀 Organised and ran the first ever <LinkPreview url="https://photos.app.goo.gl/AhxLzi7zTFaNwsUZ7" className="Link">Patch Robot Wars</LinkPreview> competition</h1>
            <h2 className={styles.SubHeading}>a competition which brought Patch allumni of all years back together to make and battle custom fighting robots</h2>

            <h1 className={styles.Heading}>🚀 Participant in <span className="Link"><LinkPreview url="https://joinpatch.org" className="Link">Patch 2023</LinkPreview></span></h1>
            <h2 className={styles.SubHeading}>the origin of where Induct was founded</h2>

            <h1 className={styles.Heading}>💻 2 months work experience at <span className="Link"><LinkPreview url="https://www.calypsoai.com/" className="Link">Calypso AI</LinkPreview></span></h1>
            <h2 className={styles.SubHeading}>a start-up US military contractor where I worked on competitor analysis</h2>

            <h1 className={styles.Heading}>💻 1 month work experience at <span className="Link"><LinkPreview url="https://www.ericsson.com/en" className="Link">Ericsson Ireland</LinkPreview></span></h1>
            <h2 className={styles.SubHeading}>learnt about their Agile dev-ops strategies, and about VOIP infrastructure</h2>

            <h1 className={styles.Heading}>💻 Worked in <span className="Link"><LinkPreview url="https://www.columbusclub.ie/" className="Link">Columbus clubs</LinkPreview></span> summer camp</h1>
            <h2 className={styles.SubHeading}>teaching computer programming to children (Scratch then later Python)</h2>

            <h1 className={styles.Heading}>💻 Made a <span className="Link"><LinkPreview url="https://www.blackrockcollegegcc.com/" className="Link">custom website</LinkPreview></span> for my school (Blackrock College)</h1>
            <h2 className={styles.SubHeading}>the global citizenship community website which is responsible for various eco-friendly projects in the school</h2>

            <h1 className={styles.Heading}>🏆 Won runners-up at <span className="Link"><LinkPreview url="https://scifest.ie/" className="Link">Sci-Fest Ireland</LinkPreview></span></h1>
            <h2 className={styles.SubHeading}>for a project analysing propeller efficiency in a vacuum</h2>

            <h1 className={styles.Heading}>🏆 Won mock Dragons-den at Blackrock College for Sizzle</h1>
            <h2 className={styles.SubHeading}>an app which recommends local groceries for new recipes to try</h2>

            <h1 className={styles.Heading}>🏅 <span className="Link"><LinkPreview url="https://www.academyofsurfing.com/" className="Link">ASI Level-1</LinkPreview></span> certified SUP instructor</h1>
            <h2 className={styles.SubHeading}>I occasionally participate in charity events or work in summer camps throughout the year</h2>
        </div>
    )
}