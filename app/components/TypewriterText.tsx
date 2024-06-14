'use client'

// components/TypewriterText.tsx
import React from 'react';
import { useTypewriter, Cursor } from 'react-simple-typewriter';
import styles from './TypewriterText.module.css';

interface TypewriterTextProps {
  text: string[];
}

const TypewriterText: React.FC<TypewriterTextProps> = ({ text }) => {
  const [typewriterText] = useTypewriter({
    words: text,
    loop: false,
    typeSpeed: 70,
    deleteSpeed: 50,
    delaySpeed: 1000,
  });

  const renderTextWithStyledLastChar = (text: string) => {
    if (!text) return null;
    const lastChar = text.slice(-1);
    const rest = text.slice(0, -1);

    return (
      <span>
        {rest}
        <span className={styles.lastChar}>{lastChar}</span>
      </span>
    );
  };

  return (
    <div className={styles.typewriter}>
      {renderTextWithStyledLastChar(typewriterText)}
      <Cursor cursorStyle="|" />
    </div>
  );
};

export default TypewriterText;
