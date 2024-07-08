import React from "react"
import styles from "./Content.module.css"
import { LinkPreview } from "../../components/link-preview"
import ContentBreaker from "../../components/ContentBreaker"
import { symlink } from "fs"
import Link from "next/link"

export default function Content(){
    return(
        <div>
            <ContentBreaker 
            title="cv" 
            subheading={
            <a 
            href="/files/Will Donnelly CV July 2024.pdf" 
            target="_blank" 
            rel="noopener noreferrer" 
            className={styles.pdfLink}
            >
            Click here to view PDF 📄
            </a>}/>
            
            <div className={styles.main}>
                <h1 className={styles.name}>William Myles Donnelly</h1>
                
                <ul className={styles.contactInfo}>
                    <li><span className={styles.highlight}>Phone:</span> +353 (83) 804 4396</li>
                    <li><span className={styles.highlight}>Email:</span> Will.donnell652 [at] gmail.com</li>
                    <li><span className={styles.highlight}>Portfolio:</span> <Link href="https://willd.dev" className={styles.link}>https://willd.dev</Link></li>
                </ul>
                
                <h2 className={styles.sectionHeading}>Personal Profile</h2>
                <p className={styles.profileText}>I'm an engineer, studying engineering with management at Trinity College Dublin. I have extensive hobbies in 3D printing, computer programming, and electrical engineering. I spend most of my spare time making stuff. Currently a Founder working at Induct, a tech start-up focused on access management.</p>
                
                <h2 className={styles.sectionHeading}>Skills</h2>
                
                <h3 className={styles.skillCategory}>Programming</h3>
                <p className={styles.skillList}>C#, C++, JavaScript, TypeScript, React, NextJS, TailwindCSS, Node.js, VS code, Visual Studio, Arduino IDE, Cursor</p>
                
                <h3 className={styles.skillCategory}>CAD/CAM</h3>
                <p className={styles.skillList}>Fusion360, KiCad, EasyEDA, Chitubox, Cura, K40 Whisperer</p>
                
                <h3 className={styles.skillCategory}>Manufacturing/Tools</h3>
                <p className={styles.skillList}>FDM 3D printing, MSLA 3D printing, PCB design, Hot air reflow soldering, soldering, oscilloscope usage</p>
                
                <h3 className={styles.skillCategory}>UI/UX Design</h3>
                <p className={styles.skillList}>Figma, Inkscape, PaintToolSAI, Aseprite</p>
                
                <h3 className={styles.skillCategory}>3D Modeling/Animation</h3>
                <p className={styles.skillList}>Blender, Meshmixer</p>
                
                <h2 className={styles.sectionHeading}>Experience</h2>
                <ul className={styles.experienceList}>
                    <li>
                        <h3 className={styles.experienceTitle}>Organised and ran the first ever <LinkPreview url="https://photos.app.goo.gl/AhxLzi7zTFaNwsUZ7" className={styles.link}>Patch Robot Wars</LinkPreview> competition</h3>
                        <p className={styles.experienceDescription}>A competition which brought Patch alumni of all years back together to make and battle custom fighting robots</p>
                    </li>
                    <li>
                        <h3 className={styles.experienceTitle}>Participant in <LinkPreview url="https://joinpatch.org" className={styles.link}>Patch 2023</LinkPreview></h3>
                        <p className={styles.experienceDescription}>The origin of where Induct was founded</p>
                    </li>
                    <li>
                        <h3 className={styles.experienceTitle}>2 months work experience at <LinkPreview url="https://www.calypsoai.com/" className={styles.link}>Calypso AI</LinkPreview></h3>
                        <p className={styles.experienceDescription}>A start-up US military contractor where I worked on competitor analysis</p>
                    </li>
                    <li>
                        <h3 className={styles.experienceTitle}>1 month work experience at <LinkPreview url="https://www.ericsson.com/en" className={styles.link}>Ericsson Ireland</LinkPreview></h3>
                        <p className={styles.experienceDescription}>Learnt about their Agile dev-ops strategies, and about VOIP infrastructure</p>
                    </li>
                    <li>
                        <h3 className={styles.experienceTitle}>3 months work in <LinkPreview url="https://www.columbusclub.ie/" className={styles.link}>Columbus clubs</LinkPreview> summer camp</h3>
                        <p className={styles.experienceDescription}>Teaching computer programming to children (Scratch then later Python)</p>
                    </li>
                    <li>
                        <h3 className={styles.experienceTitle}>Made a <LinkPreview url="https://www.blackrockcollegegcc.com/" className={styles.link}>custom website</LinkPreview> for my school (Blackrock College)</h3>
                        <p className={styles.experienceDescription}>The global citizenship community website which is responsible for various eco-friendly projects in the school</p>
                    </li>
                    <li>
                        <h3 className={styles.experienceTitle}>Won runners-up at <LinkPreview url="https://scifest.ie/" className={styles.link}>Sci-Fest Ireland</LinkPreview></h3>
                        <p className={styles.experienceDescription}>For a project analysing propeller efficiency in a vacuum</p>
                    </li>
                    <li>
                        <h3 className={styles.experienceTitle}>Won mock Dragons-den at Blackrock College for Sizzle</h3>
                        <p className={styles.experienceDescription}>An app which recommends local groceries for new recipes to try</p>
                    </li>
                    <li>
                        <h3 className={styles.experienceTitle}><LinkPreview url="https://www.academyofsurfing.com/" className={styles.link}>ASI Level-1</LinkPreview> certified SUP instructor</h3>
                        <p className={styles.experienceDescription}>I occasionally participate in charity events or work in summer camps throughout the year</p>
                    </li>
                </ul>
                
                <h2 className={styles.sectionHeading}>Education</h2>
                <ul className={styles.educationList}>
                    <li><span className={styles.highlight}>2022-Present</span> – Engineering with Management, Trinity College Dublin</li>
                    <li><span className={styles.highlight}>2022-2023</span> – The Dublin Academy of Education, Secondary Education</li>
                    <li><span className={styles.highlight}>2017-2022</span> – Blackrock College, Secondary Education</li>
                    <li><span className={styles.highlight}>2009-2017</span> – Willow Park, Primary Education</li>
                    <li><span className={styles.highlight}>2017-2020</span> – Walton Club programme, Trinity College Dublin</li>
                    <li><span className={styles.highlight}>2016-2020</span> – Academy of Code, Oatlands College</li>
                </ul>
            </div>
        </div>

    )
}