'use client'

import { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

type SteamHoursResponse = {
  totalHours: number;
};

export default function SteamHours() {
  const [totalHours, setTotalHours] = useState<number | null>(null);

  useEffect(() => {
    async function fetchHours() {
      try {
        const response = await fetch('/api/steamhours');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const data: SteamHoursResponse = await response.json();
        setTotalHours(data.totalHours);
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'An unknown error occurred');
      }
    }

    fetchHours();
  }, []);

  const count = useMotionValue(0);
  const rounded = useTransform(count, Math.round);
  const formatted = useTransform(rounded, (value) => 
    value.toLocaleString('en-US')
  );

  useEffect(() => {
    if (totalHours !== null) {
      const animation = animate(count, totalHours, {
        duration: 2,
      });

      return animation.stop;
    }
  }, [totalHours, count]);

  // Size and alignment come from the hero's counter line; this only supplies the number.
  return totalHours !== null ? (
    <motion.h1 style={{ color: 'var(--accent)' }}>{formatted}</motion.h1>
  ) : (
    <h1 style={{ color: 'var(--accent)' }}>0</h1>
  );
}
