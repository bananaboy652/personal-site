'use client'

import Hero from "./components/Hero";
import About from "./components/About";
import ContentBreaker from "./components/ContentBreaker";
import ToolsPill from "./components/ToolsPill";
import ExperiencePill from "./components/ExperiencePill";
import Footer from "./components/Footer";
import { MousePositionProvider } from "./components/MousePositionContext";
import { Projects } from "./components/Projects";

export default function Home() {
  return (
    <MousePositionProvider>
      <main>
        <section id="hero">
          <Hero />
          <About />
        </section>
        <section id="project">
          <ContentBreaker title="Projects" subheading="" />
          <Projects />
        </section>
        <section id="tools">
          <ContentBreaker title="Tools" subheading="" />
          <ToolsPill />
        </section>
        <section id="experience">
          <ContentBreaker title="Experience" subheading="" />
          <ExperiencePill />
        </section>
        <Footer />
      </main>
    </MousePositionProvider>

  );
}
