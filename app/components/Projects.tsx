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
    {/* This portfolio website */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
        <Link href="/construction">
          <Image
            src="/images/Projects/ThisSite.png"
            height="1000"
            width="1000"
            alt="thumbnail"
            className={styles.CardImage}
          />
        </Link>
        </CardItem>
        <CardItem
          translateZ="50"
          className={styles.TitleText}
        >
        <Link href="/construction">
          This Portfolio Website
        </Link>
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
          This is actually one of my first NextJS projects so that I could learn React and Typescript, it was designed in Figma.
        </CardItem>
        <CardItem
          translateZ={30}
          className={styles.ToolTags}
        >
          <ToolTags tags={['React', 'NextJS', 'Tailwind CSS', 'TypeScript', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>
    
    {/* Induct */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/Induct.png"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Induct Access Control
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Moonshot
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          The startup I'm founding. Induct is making smart access management tools for better tracking office security.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['All Of Them', 'And Then Some']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* FPV Drone */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/FPVdrone.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            FPV Racing Drone
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Blender */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/RoomRender.png"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Blender 3D Modeling
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Ongoing
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A gallery of all the things which I've modeled, simulated, and animated in Blender.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Blender', '3D Modeling', 'Animation', 'Fluid Simulation']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Altoids console */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/ConsoleRev4.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Altoids Handheld Console
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A custom PCB Pi-0 based games console which fits fully inside an Altoids mint tin. Inspired by the kit from Wermy.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Fusion360', 'SMD', 'SLA Printing', 'PCB Design']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* CS:GO Bot */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/Csgo.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Counter Strike CV Aim Bot
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A YOLO-V based bot which used CV to target enemies. This wasn't used in competitive, built purely for academics.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['C#', 'YOLO-V', 'Visual Studio', 'Computer Vision']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Bionic hand */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/BionicHand.png"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Bionic Hand
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Shelved
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A scale 1:1 recreation of a hand with full range of motion. Fully modeled, shelved during assembly so I could join Patch.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Fusion360', 'SLA Printing', 'Arduino']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Games Console Rev 3 */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/ConsoleRev3.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Games Console Mk3
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A custom PCB Pi 3B+ based games console, with several updates and my first functioning PCB layout.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Fusion360', 'SMD', 'SLA Printing', 'PCB Design']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Digital Microscope */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/Mircoscope.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Digital Microscope
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A digital microscope with enough magnification to see the weaving on a thread of cloth. Also has filters for comparing contrast in images.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Hardware Hacking */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/HardwareHacking.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Hardware Hacking
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          Installing custom firmware and expanded hardware on the Nintendo Game & Watch anniversary edition.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Linux', 'SMD Reflow', 'Hacking', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Games Console Rev 2 */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/ConsoleRev2.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Games Console Mk2
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          My first fully original project, with some upgrades to the Adafruit kit as well as a custom PCB for the buttons.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Fusion360', 'EasyEDA', 'SLA Printing', 'PCB Design']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Hal 9000 */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/Hal.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Alexa Hal 9000 Mod
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A custom shell for Alexa Gen-1, with some small modifications to the PCB to replace the LEDs.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Fusion360', 'SLA Printing', 'SMD']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Custom Figurine */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/Figurine.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Custom Character Figurine
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          A custom made Figurine of the character Monokuma with a built-in LED for my friend's birthday
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Fusion360', 'SLA Printing', 'Electronics', 'Organic modeling']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Games Console Rev 1 */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/ConsoleRev1.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Games Console MK1
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          My first full project! I made this following the wonderfull PiGrrl2 kit guide made by Adafruit.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'Fusion360', '3D Printing', 'Open-Source']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* Custom Monitor Backlighting */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/MonitorBacklighting.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            Custom Monitor Backlighting
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Completed
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          Powerful red LED strips which I soldered by hand and designed 3d printed a frame specifically for my monitor.
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Electronics', 'A lof of soldering', '3D Printing']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    {/* MSLA & FDM 3D Printing */}
    <CardContainer className={styles.CardContainer}>
      <CardBody className={styles.CardBody}>
        <div className={styles.BackgroundBlur} />
        <CardItem translateZ="60" className={styles.CardImageContainer}>
          <Link href="/construction">
            <Image
              src="/images/Projects/3DPrinters.jpg"
              height="1000"
              width="1000"
              alt="thumbnail"
              className={styles.CardImage}
            />
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.TitleText}>
          <Link href="/construction">
            MSLA & FDM 3D Printing
          </Link>
        </CardItem>
        <CardItem translateZ="50" className={styles.StatusText}>
          Status: Ongoing
        </CardItem>
        <CardItem as="p" translateZ="60" className={styles.DescriptionText}>
          Since getting my printers I've gone through about 12kg and 6L of plastic. This is a gallery of the things I've printed
        </CardItem>
        <CardItem translateZ={30} className={styles.ToolTags}>
          <ToolTags tags={['Fusion360', 'Cura', 'Chitubox', 'MSLA Printing', 'FDM Printing']} />
        </CardItem>
      </CardBody>
    </CardContainer>

    
    
    <div className={styles.spaceCorrection}></div>
    </div>
  );
}
