'use client'

import Hero from "./components/Hero"
import ContentBreaker from "../components/ContentBreaker"
import Footer from "../components/Footer"
import YouTubeChannels from "./components/YouTubeChannels"
import { MousePositionProvider } from "../components/MousePositionContext";

export default function games(){

    const channelIds = [
        'UC2C_jShtL725hvbm1arSV9w', // CGPGrey Channel ID
        'UC6nSFpj9HTCZ5t-N3Rm3-HA',  // VSauce
        'UCHnyfMqiRRG1u-2MsSQLbXA',  // Veritasium
        'UCsXVk37bltHxD1rDPwtNM8Q',  // Kurzgesagt
        //'UCu6mIX6Z8LUu2t44WN_sTrQ',  // Steve Mould
        'UCXuqSBlHAE6Xw-yeJA0Tunw',  // Linus Tech Tips
        // 'UC2LXXN8IzJJbN1LsWN1bx4w',  // Stephen Hawes
        'UC0e3QhIYukixgh5VVpKHH9Q',  // Code Bullet
        'UCYbK_tjZ2OrIZFBvU6CCMiA',  // Brackeys
        // 'UCuWNFETh4wAK1ODbnyan0lg',  // DIY Perks
        'UCqJ-Xo29CKyLTjn6z2XwYAw',  // Game Maker's Toolkit
        'UC6mIxFTvXkWQVEHPsEdflzQ',  // GreatScott!
        // 'UCrYsa9bwHB1GC_q4VZOCjWw',  // Phil's Lab
        // 'UCuKxpKGAqXr-7O1en6NSM8A',  // EEVblog
        'UCl2mFZoRqjw_ELax4Yisf6w',  // Louis Rossmann
        // 'UC3w6iBFr-GdCeV0JQWDh9jQ',  // element14 presents
        'UCYeF244yNGuFefuFKqxIAXw',  // The Royal Institution
        'UCR1IuLEqb6UEA_zQ81kwXfg',  // Real Engineering
        // 'UCuCOAX8emBkNGhUnyQYGL-Q',  // BobbyBroccoli
        // 'UCE6qE5jNqpF0LyiMkueEXnQ',  // Will Cogley
        // 'UCVHOgH4uvFOLrKSKu3dWeKQ',  // PolyMars
        'UCUHW94eEFW7hkUMVaZz4eDg',  // MinutePhysics
        // 'UCc4OEi7I1cqAp1a9yitp2jQ',  // RC Life On
        // 'UCiIrO-EpNHlGLG42w_-6I9A',  // Shank Mods
        // 'UCQWLB2fK9RU8FTwoW0ZAG6g',  // Cody's Lab
        'UCp68_FLety0O-n9QU6phsgw',  // colinfurze
        'UC7yF9tV4xWEMZkel7q8La_w',  // PeterSripol
        // 'UCUHqnmTxQ7N89t-jTvzTC-g',  // Carykh
        // 'UCR-QxEaj4Vn5GEyuOBAnRQw',  // Jeff Geerling
        // 'UCfYo1VBIcVFr_GfGNVX1hpw',  // Acerola
        'UC0M0rxSz3IF0CsSour1iWmw',  // LiveOverflow
        // 'UCv1XUiTIW5VofEEnFE2i7ZQ',  // AlphaPhoenix
        // 'UCm4C4slpkFq5k7TLxOHmoxg',  // Sebastian Lague
        'UCbfYPyITQ-7l4upoX8nvctg',  // Two Minute Papers
        'UCYO_jab_esuFRV4b17AJtAw',  // 3Blue1Brown
        // 'UC8QUtH8gkNQs4jQP79OHfkg',  // Barji
        'UC9-y-6csu5WGm29I7JiwpnA',  // Computerphile
        // 'UCR1DpgY8kmNOsLCcqFF5KVA',  // Michael Reeves
        // 'UC1D3yD4wlPMico0dss264OA',  // NileRed
        // 'UCf9kaxmi01hNMFd2lbaCq7w',  // NileBlue
        'UCoxcjq-8xIDTYp3uz647V5A',  // Numberphile
        // 'UCO8dKRGwnetVqW3wMbhH4pA',  // People Make Games
        'UC9RM-iSvTu1uPJb8X5yp3EQ',  // Wendover Productions
        'UCimiUgDLbi6P17BdaCZpVbg',  // Exurb1a
        'UCttFk8-Nysnyw59aNlWOWzw',  // Pursuit of Wonder
        'UCSju5G2aFaWMqn-_0YBtq5A',  // Stand-up Maths
        // 'UC9ZWVZ46kL1oKtbm6FW3kQA',  // Ben Eater
        'UCvmINlrza7JHB1zkIOuXEbw',  // Fireship
        // 'UC7dZRwrHRlhGbZ6bmffp0VA',  // James Bruton
        // 'UCsl42VeSWgG8z8wNlkD2mcQ',  // Tom Stanton
        'UCiDJtJKMICpb9B1qf7qjEOA',  // AvE
        'UCBa659QWEk1AI4Tg--mrJ2A',  // Tom Scott
        // 'UCt1Pb5_JrRY_bH6ukmjRJtA',  // Primer
        // 'UCGEbpYlEypz7xZK1yPbk4SA',  // Stuff Made Here
        // 'UCk8QbZzGdR43x3ZtLEzPGxQ',  // ElectroBOOM
        // 'UCbFXsnErdd203Hz6w8dIG0w',  // TheBackyardScientist
        'UC6107grRI4m0o2-emgoDnAA',  // SmarterEveryday
        'UCfMJ2MchTSW2kWaT0kK94Yw',  // William Osman
        'UCJLZe_NoiG0hT7QCX_9vmqw',   // I did a thing
        'UCRC6cNamj9tYAO6h_RXd5xA', // RTGame Channel ID
        
    ];

    return(
        <MousePositionProvider>
            <main>
                <Hero />
                <ContentBreaker title="YouTube" subheading="These days 20 minutes is all you need to know more about a topic than 90% of the population"/>
                <YouTubeChannels channelIds={channelIds} />
                <ContentBreaker title="Books" subheading="I should definitely read more..." />
                <Footer/>
            </main>
        </MousePositionProvider>
    )
}