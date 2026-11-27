"use client";

import Image from "next/image";
import React from "react";
import { CardBody, CardContainer, CardItem } from "./3d-card";
import ToolTags from "./ToolTags";
import Link from "next/link";
import styles from "./Projects.module.css"
import { projects } from "../projects/data";

// One card for every project in projects/data.ts, in that order. A card's
// picture and title lead to the project's own page.
export function Projects() {
  return (
    <div className={styles.main}>
    {projects.map((project) => {
      const page = `/projects/${project.slug}`;
      return (
        <CardContainer className={styles.CardContainer} key={project.slug}>
          <CardBody className={styles.CardBody}>
            <div className={styles.BackgroundBlur} />
            <CardItem translateZ="60" className={styles.CardImageContainer}>
              <Link href={page}>
                <Image
                  src={project.image}
                  height="1000"
                  width="1000"
                  alt={project.title}
                  className={styles.CardImage}
                />
              </Link>
            </CardItem>
            <CardItem translateZ="50" className={styles.TitleText}>
              <Link href={page}>
                {project.title}
              </Link>
            </CardItem>
            <CardItem translateZ="50" className={styles.StatusText}>
              Status: {project.statusHref
                ? <span className="Link"><a href={project.statusHref}>{project.status}</a></span>
                : project.status}
            </CardItem>
            <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
              {project.summary}
            </CardItem>
            <CardItem translateZ={30} className={styles.ToolTags}>
              <ToolTags tags={project.tags} />
            </CardItem>
          </CardBody>
        </CardContainer>
      );
    })}

    <div className={styles.spaceCorrection}></div>
    </div>
  );
}
