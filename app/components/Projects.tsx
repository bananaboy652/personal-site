"use client";

import Image from "next/image";
import React from "react";
import { CardBody, CardContainer, CardItem } from "./3d-card";
import ToolTags from "./ToolTags";
import Link from "next/link";
import styles from "./Projects.module.css"

export function Projects() {
  return (
    <div className={styles.main}>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/Induct.png"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          Induct Access Control
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Moonshot
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['All Of Them', 'And Then Some']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/ThisSite.png"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          This Portfolio Website
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: <span className="Link"><a href="mailto:will.donnell652@gmail.com?subject=Hey%20Will!%20Love%20the%20site!&body=Hey%20Will,%20just%20want%20to%20say%20the%20site%20looks%20amazing%20because:%20">You tell me</a></span>
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['React', 'NextJS', 'Tailwind CSS', 'TypeScript', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Image
            src="/images/projects/FPVdrone.jpg"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
          FPV Racing Drone
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.StatusText}
        >
          Status: Completed
        </CardItem>
        <CardItem
          as="p"
          translateZ="60"
          className={styles.DescriptionText}
        >
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    
    <div className={styles.spaceCorrection}></div>
    </div>
  );
}
