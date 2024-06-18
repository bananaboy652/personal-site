import styles from "./ToolsPill.module.css"
import Image from "next/image"

export default function ToolsPill(){
    return(
        <div className={styles.main}>
            <div className={styles.Icons}>
                <span className={styles.Title}>{"Software"}</span>
                <div className={styles.Segment}>
                    <div className={styles.SubTitle}>{"// CAD/CAM Software"}</div>
                    <div className={styles.IconRow}>
                    <a href="https://www.autodesk.com/products/fusion-360/overview" target="_blank" rel="noopener noreferrer">
                        <Image
                            src="/images/icons/Fusion360.png"
                            height="40"
                            width="40"
                            alt="Fusion 360"
                            className={styles.Icon}
                        />
                    </a>
                    <a href="https://www.chitubox.com/" target="_blank" rel="noopener noreferrer">
                        <Image
                            src="/images/icons/chitubox.png"
                            height="40"
                            width="40"
                            alt="Chitubox"
                            className={styles.Icon}
                        />
                    </a>
                    <a href="https://ultimaker.com/software/ultimaker-cura" target="_blank" rel="noopener noreferrer">
                        <Image
                            src="/images/icons/cura.png"
                            height="40"
                            width="40"
                            alt="Cura"
                            className={styles.Icon}
                        />
                    </a>
                    <a href="https://www.scorchworks.com/K40whisperer/k40whisperer.html" target="_blank" rel="noopener noreferrer">
                        <Image
                            src="/images/icons/k40whisperer.png"
                            height="40"
                            width="40"
                            alt="K40 Whisperer"
                            className={styles.Icon}
                        />
                    </a>
                                    <a href="https://easyeda.com/" target="_blank" rel="noopener noreferrer">
                        <Image
                            src="/images/icons/easyeda.png"
                            height="40"
                            width="40"
                            alt="EasyEDA"
                            className={styles.Icon}
                        />
                    </a>
                    <a href="https://kicad.org/" target="_blank" rel="noopener noreferrer">
                        <Image
                            src="/images/icons/kicad.png"
                            height="40"
                            width="40"
                            alt="KiCad"
                            className={styles.Icon}
                        />
                    </a>
                    </div>
                    
                </div>

                <div className={styles.Segment}>
                <span className={styles.SubTitle}>{"// 3D Modeling"}</span>
                <div className={styles.IconRow}>
                <a href="https://www.blender.org/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/blender.png"
                        height="40"
                        width="40"
                        alt="Blender"
                        className={styles.Icon}
                    />
                </a>
                <a href="http://www.meshmixer.com/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/meshmixer.png"
                        height="40"
                        width="40"
                        alt="Meshmixer"
                        className={styles.Icon}
                    />
                </a>
                </div>
                
                </div>
                
                <div className={styles.Segment}>
                <span className={styles.SubTitle}>{"// Video Editing"}</span>
                <div className={styles.IconRow}>
                <a href="https://www.blackmagicdesign.com/products/davinciresolve/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/davinciresolve.png"
                        height="40"
                        width="40"
                        alt="DaVinci Resolve"
                        className={styles.Icon}
                    />
                </a>
                </div>
                
                </div>
                
                <div className={styles.Segment}>
                    <span className={styles.SubTitle}>{"// UI/UX Design"}</span>
                <div className={styles.IconRow}>
                    <a href="https://www.figma.com/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/figma.png"
                        height="40"
                        width="40"
                        alt="Figma"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://inkscape.org/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/inkscape.png"
                        height="40"
                        width="40"
                        alt="Inkscape"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://www.systemax.jp/en/sai/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/painttoolsai.png"
                        height="40"
                        width="40"
                        alt="Paint Tool Sai"
                        className={styles.Icon}
                    />
                </a>
                </div>
                

                </div>
                
                <div className={styles.Segment}>
                    <span className={styles.SubTitle}>{"// Software Development"}</span>
                    <div className={styles.IconRow}>
                        <a href="https://docs.microsoft.com/en-us/dotnet/csharp/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/csharp.png"
                        height="40"
                        width="40"
                        alt="C#"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://nextjs.org/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/nextjs.png"
                        height="40"
                        width="40"
                        alt="Next.js"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://www.python.org/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/python.png"
                        height="40"
                        width="40"
                        alt="Python"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://reactjs.org/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/react.png"
                        height="40"
                        width="40"
                        alt="React"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://tailwindcss.com/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/tailwind.png"
                        height="40"
                        width="40"
                        alt="Tailwind CSS"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/javascript.png"
                        height="40"
                        width="40"
                        alt="JavaScript"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/typescript.png"
                        height="40"
                        width="40"
                        alt="TypeScript"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/github.png"
                        height="40"
                        width="40"
                        alt="GitHub"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://chat.openai.com/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/chatgpt.png"
                        height="40"
                        width="40"
                        alt="ChatGPT"
                        className={styles.Icon}
                    />
                </a>
                    </div>
                
                </div>
                
                <div className={styles.Segment}>
                <span className={styles.SubTitle}>{"// IDEs"}</span>
                <div className={styles.IconRow}>
                    <a href="https://code.visualstudio.com/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/vscode.png"
                        height="40"
                        width="40"
                        alt="Visual Studio Code"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://visualstudio.microsoft.com/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/visualstudio.png"
                        height="40"
                        width="40"
                        alt="Visual Studio IDE"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://www.arduino.cc/en/software" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/arduino.png"
                        height="40"
                        width="40"
                        alt="Arduino IDE"
                        className={styles.Icon}
                    />
                </a>
                <a href="https://www.cursor.so/" target="_blank" rel="noopener noreferrer">
                    <Image
                        src="/images/icons/cursor.png"
                        height="40"
                        width="40"
                        alt="Cursor IDE"
                        className={styles.Icon}
                    />
                </a>
                </div>
                </div>
            </div>
            <div className={styles.Hardware}>
                <span className={styles.Title}>{"Hardware"}</span>
                <p className={styles.List}>
                    Creality Ender3 S3 Pro - FDM 3D Printer<br/>
                    Elegoo Mars 2 - MSLA 3D Printer<br/>
                    Pinecil - Soldering Iron<br/>
                    Hot Air Soldering Station<br/>
                    K40 - CO2 Laser Cutter<br/>
                    Variable 30W PSU<br/>
                    Oscilloscope<br/>
                    Huion drawing tablet<br/>
                    Fairphone 4<br/>
                    Oura Ring<br/>
                    Fitbit Versa 3<br/>
                    Sennheiser HD4.50BT<br/>
                    Steam Deck<br/>
                    Flipper Zero<br/>
                    Asus ROG Zephrus M16<br/>
                    AMD Ryzen 7 5800X | Nvidia RTX 3060<br/>
                </p>
                
            </div>
        </div>
    )
}