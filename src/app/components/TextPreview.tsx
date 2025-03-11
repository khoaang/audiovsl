import * as React from 'react';
import Draggable from 'react-draggable';
import { TextElement } from './VideoSettings';

const fontMap = {
  'Inter': 'var(--font-inter)',
  'Roboto Mono': 'var(--font-roboto-mono)',
  'Playfair Display': 'var(--font-playfair)',
  'Bebas Neue': 'var(--font-bebas-neue)',
  'Permanent Marker': 'var(--font-permanent-marker)',
};

interface TextPreviewProps {
  element: TextElement;
  containerRef: React.RefObject<HTMLDivElement>;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onSizeChange: (id: string, size: number) => void;
}

export function TextPreview({ element, containerRef, onPositionChange, onSizeChange }: TextPreviewProps) {
  // Create a ref for the draggable node to fix React 18 compatibility
  const nodeRef = React.useRef(null);
  
  const handleDrag = (_e: any, data: { x: number; y: number }) => {
    onPositionChange(element.id, { x: data.x, y: data.y });
  };

  const handleResize = (e: React.MouseEvent<HTMLDivElement>, direction: 'left' | 'right') => {
    if (!containerRef.current) return;

    const container = containerRef.current.getBoundingClientRect();
    const text = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!text) return;

    const mouseX = e.clientX - container.left;
    const textCenter = text.left - container.left + text.width / 2;
    const distance = Math.abs(mouseX - textCenter) * 2;

    const newSize = Math.max(12, Math.min(72, Math.round(distance / container.width * 200)));
    onSizeChange(element.id, newSize);
  };

  return (
    <Draggable
      nodeRef={nodeRef}
      position={element.position}
      onDrag={handleDrag}
      bounds="parent"
    >
      <div
        ref={nodeRef}
        className="absolute cursor-move select-none group"
        style={{
          fontFamily: fontMap[element.font as keyof typeof fontMap],
          fontSize: `${element.size}px`,
          color: element.color,
        }}
      >
        <div className="relative">
          <div
            className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-4 h-4 cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleResize(e, 'left')}
          />
          <div
            className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 w-4 h-4 cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleResize(e, 'right')}
          />
          {element.text || 'enter text...'}
        </div>
      </div>
    </Draggable>
  );
} 