import React from 'react';
import ReactDOM from 'react-dom';
import { useMousePosition } from './MousePositionContext';

const CopiedMessage: React.FC<{ show: boolean }> = ({ show }) => {
  const { x, y, scrollY } = useMousePosition();

  if (!show) return null;

  return ReactDOM.createPortal(
    <div style={{ 
        top: y - 30 + scrollY, // Adjusted for scroll position
        left: x - 0,
        position: 'absolute',
        backgroundColor: '#5865F2',
        color: 'white',
        fontSize: '0.75rem',
        padding: '0.25rem',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        borderRadius: '1rem',
        zIndex: '950',
        pointerEvents: 'none'
      }}
    >
      Username copied!
    </div>,
    document.body
  );
};

export default CopiedMessage;
