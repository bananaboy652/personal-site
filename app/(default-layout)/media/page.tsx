"use client";

import Hero from "./components/Hero";
import ContentBreaker from "../components/ContentBreaker";
import Footer from "../components/Footer";
import YouTubeChannels from "./components/YouTubeChannels";
import { MousePositionProvider } from "../components/MousePositionContext";
import { useEffect, useState } from "react";
import BookInfo from './components/BookInfo';

const channelIds = [
        'UC2CjShtL725hvbm1arSV9w', // CGPGrey Channel ID
        'UC6nSFpj9HTCZ5t-N3Rm3-HA',  // VSauce
        'UCHnyfMqiRRG1u-2MsSQLbXA',  // Veritasium
        'UCsXVk37bltHxD1rDPwtNM8Q',  // Kurzgesagt
        'UCEIwxahdLz7bap-VDs9h35A',  // Steve Mould
        'UCXuqSBlHAE6Xw-yeJA0Tunw',  // Linus Tech Tips
        'UCMf49SMPnhxdLormhEpfyfg',  // Stephen Hawes
        'UC0e3QhIYukixgh5VVpKHH9Q',  // Code Bullet
        'UCYbK_tjZ2OrIZFBvU6CCMiA',  // Brackeys
        'UCUQo7nzH1sXVpzL92VesANw',  // DIY Perks
        'UCqJ-Xo29CKyLTjn6z2XwYAw',  // Game Maker's Toolkit
        'UC6mIxFTvXkWQVEHPsEdflzQ',  // GreatScott!
        'UCVryWqJ4cSlbTSETBHpBUWw',  // Phil's Lab
        'UC2DjFE7Xf11URZqWBigcVOQ',  // EEVblog
        'UCl2mFZoRqjw_ELax4Yisf6w',  // Louis Rossmann
        'UChturLXwYxwTOf_5krs0qvA',  // element14 presents
        'UCYeF244yNGuFefuFKqxIAXw',  // The Royal Institution
        'UCR1IuLEqb6UEA_zQ81kwXfg',  // Real Engineering
        'UCSPLhwvj0gBufjDRzSQb3GQ',  // BobbyBroccoli
        'UCkUD_8b1JoTL2ipOVtxfNKw',  // Will Cogley
        'UCl7dSJloxuCa9IBFml7sakw',  // PolyMars
        'UCUHW94eEFW7hkUMVaZz4eDg',  // MinutePhysics
        'UC873OURVczg_utAk8dXx_Uw',  // RC Life On
        'UCUCo_G9HneFK4Luncw6v-Bw',  // Shank Mods
        'UCu6mSoMNzHQiBIOCkHUa2Aw',  // Cody's Lab
        'UCp68_FLety0O-n9QU6phsgw',  // colinfurze
        'UC7yF9tV4xWEMZkel7q8La_w',  // PeterSripol
        'UC9z7EZAbkphEMg0SP7rw44A',  // Carykh
        'UCR-DXc1voovS8nhAvccRZhg',  // Jeff Geerling
        'UCQG40havu4kNpB4pxUDQhYQ',  // Acerola
        'UClcE-kVhqyiHCcjYwcpfj9w',  // LiveOverflow
        'UCCWeRTgd79JL0ilH0ZywSJA',  // AlphaPhoenix
        'UCmtyQOKKmrMVaKuRXz02jbQ',  // Sebastian Lague
        'UCbfYPyITQ-7l4upoX8nvctg',  // Two Minute Papers
        'UCYO_jab_esuFRV4b17AJtAw',  // 3Blue1Brown
        'UCz3l6nyODzXLzTxIkARZ8rw',  // Barji
        'UC9-y-6csu5WGm29I7JiwpnA',  // Computerphile
        'UCtHaxi4GTYDpJgMSGy7AeSw',  // Michael Reeves
        'UCFhXFikryT4aFcLkLw2LBLA',  // NileRed
        'UC1D3yD4wlPMico0dss264XA',  // NileBlue
        'UCoxcjq-8xIDTYp3uz647V5A',  // Numberphile
        'UCZB6V9fUov0Mx_us3MWWILg',  // People Make Games
        'UC9RM-iSvTu1uPJb8X5yp3EQ',  // Wendover Productions
        'UCimiUgDLbi6P17BdaCZpVbg',  // Exurb1a
        'UC-tLyAaPbRZiYrOJxAGB7dQ',  // Pursuit of Wonder
        'UCSju5G2aFaWMqn-_0YBtq5A',  // Stand-up Maths
        'UCS0N5baNlQWJCUrhCEo8WlA',  // Ben Eater
        'UCsBjURrPoezykLs9EqgamOA',  // Fireship
        'UCUbDcUPed50Y_7KmfCXKohA',  // James Bruton
        'UC67gfx2Fg7K2NSHqoENVgwA',  // Tom Stanton
        'UCiDJtJKMICpb9B1qf7qjEOA',  // AvE
        'UCBa659QWEk1AI4Tg--mrJ2A',  // Tom Scott
        'UCKzJFdi57J53Vr_BkTfN3uQ',  // Primer
        'UCj1VqrHhDte54oLgPG4xpuQ',  // Stuff Made Here
        'UCJ0-OtVpF0wOKEqT2Z1HEtA',  // ElectroBOOM
        'UC06E4Y_-ybJgBUMtXx8uNNw',  // TheBackyardScientist
        'UC6107grRI4m0o2-emgoDnAA',  // SmarterEveryday
        'UCfMJ2MchTSW2kWaT0kK94Yw',  // William Osman
        'UCJLZe_NoiG0hT7QCX_9vmqw',  // I did a thing
        'UCRC6cNamj9tYAO6h_RXd5xA',  // RTGame Channel ID

];

const isbns = [
    '9781473695993',  // Brief answers to big questions
    '9780735211292',  // Atomic Habits
    '9780593715833',  // The diary of a pretencious knob-head
    '9780345391827',  // Life the universe and everything
    '9780345391810',  // The restaurant at the end of the universe
    '9781529046137',  // The hitchhikers guide to the galaxy
    '9781408865255',  // Paper Towns
    '9781101911594',  // To be a machine
    '9780399576447',  // The world in a grain
    '9781783962433',  // Prisoners of Geography
    '9781982172008',  // Chip war
    '9781501144325',  // Why we sleep
    '9781541701366',  // The Dictator's Handbook
  ];

export default function Media() {
  return (
    <MousePositionProvider>
      <main>
        <Hero />
        <ContentBreaker title="YouTube" subheading="These days 20 minutes is all you need to know more about a topic than 90% of the population" />
        <YouTubeChannels channelIds={channelIds} />
        <ContentBreaker title="Books" subheading="I should definitely read more..." />
        <BookInfo isbns={isbns} /> {/* Example ISBN */}
        <Footer />
      </main>
    </MousePositionProvider>
  );
}
