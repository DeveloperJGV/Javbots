import type { ReactNode } from 'react';

interface DropdownProps {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
  /** Which way it opens from its anchor (the toolbar column on the left opens right). */
  direction?: 'up' | 'down' | 'right';
}

export function Dropdown({ isOpen, children, className = '', direction = 'up' }: DropdownProps) {
  if (!isOpen) return null;

  const position = {
    up: 'bottom-full left-0 pb-10',
    down: 'top-full left-0 pt-10',
    right: 'left-full top-0 pl-10',
  }[direction];
  return (
    <div className={`absolute ${position} z-10`}>
      <div className={`bg-bg border-2 border-border rounded-none shadow-pixel p-4 ${className}`}>
        {children}
      </div>
    </div>
  );
}

interface DropdownItemProps {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

export function DropdownItem({ onClick, children, className = '' }: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left py-2 px-12 bg-transparent border-none rounded-none cursor-pointer whitespace-nowrap hover:bg-btn-bg ${className}`}
    >
      {children}
    </button>
  );
}
