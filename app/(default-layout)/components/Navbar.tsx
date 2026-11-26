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

    // A home-page section link is active only while that section is on screen.
    const sectionClass = (section: string) =>
        isActive('/') && activeSection === section ? styles.active : styles.inactive;
    const pageClass = (path: string) => isActive(path) ? styles.active : styles.inactive;
    const trimClass = scrolled ? `${styles.trim} ${styles.trimHidden}` : styles.trim;

    return(
        <div className={styles.main}>
            <nav className={styles.nav}>
                <a href="/" className={styles.home}>
                    <img className={styles.logo}
                        src = "/images/logo.png"
                        alt = "Main logo"
                        width={22}
                        height={22}
                    />
                </a>
                <div className={`${styles.group} ${styles.portfolio}`}>
                    <a href="/" className={sectionClass('hero')}>
                        ✨ About me
                    </a>
                    <Link href="/#project" className={sectionClass('project')}>
                        💻 Projects
                    </Link>
                    <Link href="/#tools" className={sectionClass('tools')}>
                        🛠️ Tools
                    </Link>
                    <Link href="/#experience" className={sectionClass('experience')}>
                        🧠 Experience
                    </Link>
                    <div className={trimClass} aria-hidden="true">
                        <p className={styles.trimText}>(Boring portfolio stuff.)</p>
                    </div>
                </div>
                <div className={`${styles.group} ${styles.personal}`}>
                    <Link href="/games" className={pageClass('/games')}>
                        🎮 Games
                    </Link>
                    <Link href="/media" className={pageClass('/media')}>
                        🍿 Media
                    </Link>
                    <div className={trimClass} aria-hidden="true">
                        <p className={styles.trimText}>(Fun personal stuff.)</p>
                    </div>
                </div>
            </nav>
        </div>
    )
}
