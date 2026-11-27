// Every project on the site, in the order the home page shows them.
// The grid on the home page (components/Projects.tsx) and each project's own
// page (projects/[slug]/page.tsx) are both drawn from this list, so a project
// is added, reworded or reordered here and nowhere else.

export interface ProjectLink {
  /** what the button says */
  label: string;
  href: string;
}

export interface Project {
  /** the last part of the page's address: /projects/<slug>. Changing it breaks links to the page. */
  slug: string;
  title: string;
  /** what follows "Status:" on the card */
  status: string;
  /** where the status itself leads, for the one card whose status is a link */
  statusHref?: string;
  /** the card's description */
  summary: string;
  tags: string[];
  /** under /public */
  image: string;
  /** places outside this site: the repository, the product's own site */
  links?: ProjectLink[];
  /** The write-up on the project's own page, a section at a time: what it is, how it was built,
   *  what was learned. A section left out says on the page that it has not been written yet.
   *  Leave a blank line between paragraphs. */
  writeup?: { what?: string; how?: string; learned?: string };
}

export const projects: Project[] = [
  {
    slug: 'this-portfolio-website',
    title: 'This Portfolio Website',
    status: 'You tell me',
    statusHref: 'mailto:will.donnell652@gmail.com?subject=Hey%20Will!%20Love%20the%20site!&body=Hey%20Will,%20just%20want%20to%20say%20the%20site%20looks%20amazing%20because:%20',
    summary: 'This is actually one of my first NextJS projects so that I could learn React and Typescript, it was designed in Figma.',
    tags: ['React', 'NextJS', 'Tailwind CSS', 'TypeScript', 'Open-Source'],
    image: '/images/Projects/ThisSite.png',
    links: [{ label: 'Source on GitHub', href: 'https://github.com/bananaboy652/personal-site' }],
  },
  {
    slug: 'induct-access-control',
    title: 'Induct Access Control',
    status: 'Moonshot',
    summary: "The startup I'm founding. Induct is making smart access management tools for better tracking office security.",
    tags: ['All Of Them', 'And Then Some'],
    image: '/images/Projects/Induct.png',
    links: [{ label: 'induct.ie', href: 'https://induct.ie/' }],
  },
  {
    slug: 'fpv-racing-drone',
    title: 'FPV Racing Drone',
    status: 'Completed',
    summary: 'A custom built FPV racing quadcopter with a carbon fibre frame that tops out at about 130km/h.',
    tags: ['Electronics', 'Fusion360', '3D Printing', 'Betaflight', 'Open-Source'],
    image: '/images/Projects/FPVdrone.jpg',
  },
  {
    slug: 'bionic-hand',
    title: 'Bionic Hand',
    status: 'Shelved',
    summary: 'A scale 1:1 recreation of a hand with full range of motion. Fully modeled, shelved during assembly so I could join Patch.',
    tags: ['Electronics', 'Fusion360', 'SLA Printing', 'Arduino'],
    image: '/images/Projects/BionicHand.png',
  },
  {
    slug: 'altoids-handheld-console',
    title: 'Altoids Handheld Console',
    status: 'Completed',
    summary: 'A custom PCB Pi-0 based games console which fits fully inside an Altoids mint tin. Inspired by the kit from Wermy.',
    tags: ['Electronics', 'Fusion360', 'SMD', 'SLA Printing', 'PCB Design'],
    image: '/images/Projects/ConsoleRev4.jpg',
  },
  {
    slug: 'counter-strike-cv-aim-bot',
    title: 'Counter Strike CV Aim Bot',
    status: 'Completed',
    summary: "A YOLO-V based bot which used CV to target enemies. This wasn't used in competitive, built purely for academics.",
    tags: ['C#', 'YOLO-V', 'Visual Studio', 'Computer Vision'],
    image: '/images/Projects/Csgo.jpg',
  },
  {
    slug: 'hardware-hacking',
    title: 'Hardware Hacking',
    status: 'Completed',
    summary: 'Installing custom firmware and expanded hardware on the Nintendo Game & Watch anniversary edition.',
    tags: ['Electronics', 'Linux', 'SMD Reflow', 'Hacking', 'Open-Source'],
    image: '/images/Projects/HardwareHacking.jpg',
  },
  {
    slug: 'games-console-mk3',
    title: 'Games Console Mk3',
    status: 'Completed',
    summary: 'A custom PCB Pi 3B+ based games console, with several updates and my first functioning PCB layout.',
    tags: ['Electronics', 'Fusion360', 'SMD', 'SLA Printing', 'PCB Design'],
    image: '/images/Projects/ConsoleRev3.jpg',
  },
  {
    slug: 'digital-microscope',
    title: 'Digital Microscope',
    status: 'Completed',
    summary: 'A digital microscope with enough magnification to see the weaving on a thread of cloth. Also has filters for comparing contrast in images.',
    tags: ['Electronics', 'Fusion360', '3D Printing'],
    image: '/images/Projects/Mircoscope.jpg',
  },
  {
    slug: 'blender-3d-modeling',
    title: 'Blender 3D Modeling',
    status: 'Ongoing',
    summary: "A gallery of all the things which I've modeled, simulated, and animated in Blender.",
    tags: ['Blender', '3D Modeling', 'Animation', 'Fluid Simulation'],
    image: '/images/Projects/RoomRender.png',
  },
  {
    slug: 'games-console-mk2',
    title: 'Games Console Mk2',
    status: 'Completed',
    summary: 'My first fully original project, with some upgrades to the Adafruit kit as well as a custom PCB for the buttons.',
    tags: ['Electronics', 'Fusion360', 'EasyEDA', 'SLA Printing', 'PCB Design'],
    image: '/images/Projects/ConsoleRev2.jpg',
  },
  {
    slug: 'alexa-hal-9000-mod',
    title: 'Alexa Hal 9000 Mod',
    status: 'Completed',
    summary: 'A custom shell for Alexa Gen-1, with some small modifications to the PCB to replace the LEDs.',
    tags: ['Electronics', 'Fusion360', 'SLA Printing', 'SMD'],
    image: '/images/Projects/Hal.jpg',
  },
  {
    slug: 'custom-character-figurine',
    title: 'Custom Character Figurine',
    status: 'Completed',
    summary: "A custom made Figurine of the character Monokuma with a built-in LED for my friend's birthday",
    tags: ['Fusion360', 'SLA Printing', 'Electronics', 'Organic modeling'],
    image: '/images/Projects/Figurine.jpg',
  },
  {
    slug: 'games-console-mk1',
    title: 'Games Console MK1',
    status: 'Completed',
    summary: 'My first full project! I made this following the wonderfull PiGrrl2 kit guide made by Adafruit.',
    tags: ['Electronics', 'Fusion360', '3D Printing', 'Open-Source'],
    image: '/images/Projects/ConsoleRev1.jpg',
  },
  {
    slug: 'custom-monitor-backlighting',
    title: 'Custom Monitor Backlighting',
    status: 'Completed',
    summary: 'Powerful red LED strips which I soldered by hand and designed 3d printed a frame specifically for my monitor.',
    tags: ['Electronics', 'A lof of soldering', '3D Printing'],
    image: '/images/Projects/MonitorBacklighting.jpg',
  },
  {
    slug: 'msla-and-fdm-3d-printing',
    title: 'MSLA & FDM 3D Printing',
    status: 'Ongoing',
    summary: "Since getting my printers I've gone through about 12kg and 6L of plastic. This is a gallery of the things I've printed",
    tags: ['Fusion360', 'Cura', 'Chitubox', 'MSLA Printing', 'FDM Printing'],
    image: '/images/Projects/3DPrinters.jpg',
  },
];

export const projectBySlug = (slug: string) => projects.find((p) => p.slug === slug);
