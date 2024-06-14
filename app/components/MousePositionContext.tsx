import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';

interface MousePositionContextProps {
  x: number;
  y: number;
  scrollX: number;
  scrollY: number;
}

const MousePositionContext = createContext<MousePositionContextProps>({ x: 0, y: 0, scrollX: 0, scrollY: 0 });

export const MousePositionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mousePosition, setMousePosition] = useState<MousePositionContextProps>({ x: 0, y: 0, scrollX: 0, scrollY: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY, scrollX: window.scrollX, scrollY: window.scrollY });
      console.log(event.clientX, event.clientY, window.scrollX, window.scrollY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <MousePositionContext.Provider value={mousePosition}>
      {children}
    </MousePositionContext.Provider>
  );
};

export const useMousePosition = () => useContext(MousePositionContext);
