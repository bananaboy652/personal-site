"use client"

import styles from "./page.module.css"
import { motion } from "framer-motion";
import React from "react";
import Hero from "../components/Hero";
import { AuroraBackground } from "../components/AuroraBackground";
import About from "../components/About";
import ContentBreaker from "../components/ContentBreaker";
 
export default function AuroraBackgroundDemo() {
  return (
    <main>

        <AuroraBackground>
        <Hero/>
        <About/>
        <ContentBreaker title="Life" subheading="There's no such thing as work life balance."/>
        <p className=" text-white align-middle text-center">Check back later for more.</p>
        <ContentBreaker title="Sylabus" subheading="Follow these biblically for a true education."/>
        <p className=" text-white align-middle text-center">Check back later for more.</p>
        <ContentBreaker title="Impacts" subheading="My dents in the Universe."/>
        <p className=" text-white align-middle text-center">Check back later for more.</p>
        </AuroraBackground>
    </main>
  );
}