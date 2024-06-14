'use client'

import { usePathname } from "next/navigation"
import { useState, useEffect } from 'react'
import Link from "next/link"
import styles from "./Navbar.module.css"

export default function Navbar(){
    const pathname = usePathname();
    const [activeSection, setActiveSection] = useState('hero');

    useEffect(() => {
        if (pathname === '/') {
            const handleScroll = () => {
                const sections = document.querySelectorAll('section');
                sections.forEach(section => {
                    const top = section.offsetTop;
                    const height = section.offsetHeight;
                    const scrollPosition = window.scrollY + window.innerHeight * 0.1; // Trigger at 50% visibility
                    if (scrollPosition >= top && scrollPosition < top + height) {
                        setActiveSection(section.id);
                    }
                });
            };

            window.addEventListener('scroll', handleScroll);
            return () => {
                window.removeEventListener('scroll', handleScroll);
            };
        }
    }, [pathname]);


    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
        if (window.scrollY > 0) {
            setScrolled(true);
        } else {
            setScrolled(false);
        }
        };

        window.addEventListener('scroll', handleScroll);

        return () => {
        window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    // Function to check if the current path matches the given path
    const isActive = (path: any) => pathname === path;

    return(
        <div className={styles.main}>
            <a href="/">
                <img className={styles.logo}
                    src = "/images/logo.png"
                    alt = "Main logo"
                    width={50}
                    height={50}
                />
            </a>
            <nav className= {styles.nav}>
                <a href="/" className={isActive('/') ? (activeSection === 'hero' ? styles.active : styles.inactive) : styles.inactive}>
                    ✨ About me
                </a>
                <Link href="/#project" className={isActive('/') ? (activeSection === 'project' ? styles.active : styles.inactive) : styles.inactive}>
                    💻 Projects
                </Link>
                <Link href="/#tools" className={isActive('/') ? (activeSection === 'tools' ? styles.active : styles.inactive) : styles.inactive}>
                    🛠️ Tools
                </Link>
                <Link href="/#experience" className={isActive('/') ? (activeSection === 'experience' ? styles.active : styles.inactive) : styles.inactive}>
                    🧠 Experience
                </Link>
                <Link href="/games" className={isActive('/games') ? styles.active : styles.inactive}>
                    🎮 Games
                </Link>
                <Link href="/media" className={isActive('/media') ? styles.active : styles.inactive}>
                    🍿 Media
                </Link>
                <Link href="/cv" className={isActive('/cv') ? styles.active : styles.inactive}>
                    📄 CV
                </Link>
            </nav>
            <br />
            <div className={scrolled ? styles.navTrimScrolled : styles.navTrim}>
                <div className={styles.navTrimPortfolio}>
                    <div className={styles.navTrimLeftBarPortfolio} />
                    <div className={styles.navTrimRightBarPortfolio} />
                    <br/>
                    <div className={styles.navTrimCrossbarPortfolio} />
                    <div className={styles.navTrimCentrebarPortfolio} />
                    <br/>
                    <p className={styles.navTrimTextPortfolio}>(Boring portfolio stuff.)</p>
                </div>
                <div className={styles.navTrimPersonal}>
                    <div className={styles.navTrimLeftBarPersonal} />
                    <div className={styles.navTrimRightBarPersonal} />
                    <br/>
                    <div className={styles.navTrimCrossbarPersonal} />
                    <div className={styles.navTrimCentrebarPersonal} />
                    <br/>
                    <p className={styles.navTrimTextPersonal}>(Fun personal stuff.)</p>
                </div>
            </div>
        </div>
    )
}
