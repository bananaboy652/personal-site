// A page for one project: /projects/<slug>. Every project in ../data.ts gets
// one, built ahead of time. The picture, the summary and the tags come from
// that list; the write-up is a set of sections that say so until they are
// written (see `writeup` in ../data.ts).
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ContentBreaker from "../../components/ContentBreaker";
import Footer from "../../components/Footer";
import ToolTags from "../../components/ToolTags";
import { type Project, projectBySlug, projects } from "../data";
import styles from "./page.module.css";

/** The sections of a write-up, in order, and what each says while it is still empty. */
const SECTIONS: { key: keyof NonNullable<Project["writeup"]>; title: string; empty: string }[] = [
    { key: "what", title: "What it is", empty: "A proper description of this project goes here." },
    { key: "how", title: "How it was built", empty: "The story of the build goes here." },
    { key: "learned", title: "What I learned", empty: "What went right, what went wrong and what I would do differently goes here." },
];

interface Props {
    params: { slug: string };
}

// Only the projects in the list have pages; any other address is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
    return projects.map((project) => ({ slug: project.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
    const project = projectBySlug(params.slug);
    if (!project) return {};
    return {
        title: `${project.title} | Will Donnelly`,
        description: project.summary,
    };
}

export default function ProjectPage({ params }: Props) {
    const index = projects.findIndex((project) => project.slug === params.slug);
    if (index < 0) notFound();
    const project = projects[index];
    // the list runs round: the last project's "next" is the first
    const previous = projects[(index + projects.length - 1) % projects.length];
    const next = projects[(index + 1) % projects.length];
    const number = String(index + 1).padStart(2, "0");

    return (
        <main className={styles.page}>
            <header className={styles.head}>
                {/* The title block. The world behind the page measures it (data-world-title). */}
                <div className={styles.title} data-world-title>
                    <h1 className={styles.name}>{project.title}</h1>
                    <p className={styles.status}>
                        Project {number} of {projects.length}
                        <span className={styles.dot} aria-hidden="true" />
                        Status: {project.statusHref
                            ? <span className="Link"><a href={project.statusHref}>{project.status}</a></span>
                            : project.status}
                    </p>
                    <ToolTags tags={project.tags} className={styles.tags} />
                </div>
            </header>

            <section className={styles.lead}>
                <div className={styles.picture}>
                    <Image
                        src={project.image}
                        alt={project.title}
                        width={1290}
                        height={806}
                        sizes="(max-width: 46rem) 100vw, 44rem"
                        priority
                        className={styles.image}
                    />
                </div>
                <p className={styles.summary}>{project.summary}</p>
                {project.links && project.links.length > 0 && (
                    <div className={styles.links}>
                        {project.links.map((link) => (
                            <a key={link.href} className={styles.key} href={link.href} target="_blank" rel="noopener noreferrer">
                                {link.label}
                                <span className={styles.out} aria-hidden="true">↗</span>
                            </a>
                        ))}
                    </div>
                )}
            </section>

            {SECTIONS.map((section) => {
                const text = project.writeup?.[section.key];
                return (
                    <section key={section.key}>
                        <ContentBreaker title={section.title} subheading="" />
                        <div className={styles.panel}>
                            {text
                                ? text.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)
                                : (
                                    <p className={styles.empty}>
                                        <span className={styles.emptyTag}>Not written yet</span>
                                        {section.empty}
                                    </p>
                                )}
                        </div>
                    </section>
                );
            })}

            <div className={styles.more} role="navigation" aria-label="More projects">
                <Link href={`/projects/${previous.slug}`} className={`${styles.step} ${styles.previous}`}>
                    <span className={styles.arrow} aria-hidden="true">←</span>
                    <span className={styles.stepText}>
                        <span className={styles.stepLabel}>Previous</span>
                        <span className={styles.stepTitle}>{previous.title}</span>
                    </span>
                </Link>
                <Link href="/#project" className={styles.all}>
                    All projects
                </Link>
                <Link href={`/projects/${next.slug}`} className={`${styles.step} ${styles.next}`}>
                    <span className={styles.stepText}>
                        <span className={styles.stepLabel}>Next</span>
                        <span className={styles.stepTitle}>{next.title}</span>
                    </span>
                    <span className={styles.arrow} aria-hidden="true">→</span>
                </Link>
            </div>

            <Footer />
        </main>
    );
}
