import React, { useEffect, useRef, useState } from 'react';
import FamilyTree from './FamilyTree';
import { FamilyMember, Relationship } from '../types';
import '../assets/FamilyTreeModal.css';

interface FamilyTreeModalProps {
  familyMembers: FamilyMember[];
  relationships: Relationship[];
  onDeleteMember: (memberId: string) => void;
  onSelectMember: (member: FamilyMember) => void;
  selectedMember: FamilyMember | null;
  onDeleteRelationship: (relationshipId: string) => void;
  onAddMember: () => void;
  onAddRelatedMember: (member: FamilyMember) => void;
  onAddExistingRelationship: (member: FamilyMember) => void;
  onEditMember: (member: FamilyMember) => void;
  onClose: () => void;
  firstMember?: FamilyMember | null;
  isFullscreen?: boolean;
}

const FamilyTreeModal: React.FC<FamilyTreeModalProps> = (props) => {
  const [externalPan, setExternalPan] = useState<{ dx: number; dy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Reduced from 200 to 50 for more controlled movement
  const MOVE_AMOUNT = 10;
  // Alternative: You can make it adaptive based on container size
  // const MOVE_AMOUNT = containerRef.current ? Math.min(containerRef.current.clientWidth * 0.1, 100) : 50;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
      // Add keyboard navigation - only if not focused on an input/button
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'BUTTON' ||
        activeElement.tagName === 'TEXTAREA'
      );

      if (!isInputFocused) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          handleNavigate('left');
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          handleNavigate('right');
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          handleNavigate('up');
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          handleNavigate('down');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore body scroll when modal closes
      document.body.style.overflow = 'unset';
    };
  }, [props.onClose]);

  const findFamilyTreeContainer = (): HTMLElement | null => {
    if (!containerRef.current) return null;
    return containerRef.current.querySelector('.family-tree-container') as HTMLElement;
  };

  const triggerPanEvent = (direction: 'left' | 'right' | 'up' | 'down') => {
    const treeContainer = findFamilyTreeContainer();
    if (!treeContainer) return;

    const containerRect = treeContainer.getBoundingClientRect();
    const MOVE_AMOUNT = Math.min(50, containerRect.width * 0.1);

    let dx = 0, dy = 0;

    switch (direction) {
      case 'left': dx = MOVE_AMOUNT; break;
      case 'right': dx = -MOVE_AMOUNT; break;
      case 'up': dy = MOVE_AMOUNT; break;
      case 'down': dy = -MOVE_AMOUNT; break;
    }

    setExternalPan({ dx, dy });

    // Reset after a tick to avoid re-triggering
    setTimeout(() => {
      setExternalPan(null);
    }, 50);
  };

  const handleNavigate = (direction: 'left' | 'right' | 'up' | 'down') => {
    triggerPanEvent(direction);
  };

  const handleCenterView = () => {
    // Try to find and click the existing "Center on First Member" button first
    const treeContainer = findFamilyTreeContainer();
    if (treeContainer) {
      const buttons = Array.from(treeContainer.querySelectorAll('button'));
      const centerButton = buttons.find(btn =>
        btn.textContent?.includes('Center on First Member') ||
        btn.textContent?.includes('Center') ||
        btn.title?.includes('Center')
      );

      if (centerButton) {
        centerButton.click();
        console.log('Clicked existing center button');
        return;
      }

      // Fallback: Try to find "Reset View" button
      const resetButton = buttons.find(btn =>
        btn.textContent?.includes('Reset View') ||
        btn.textContent?.includes('Reset')
      );

      if (resetButton) {
        resetButton.click();
        console.log('Clicked reset view button');
        return;
      }
    }

    console.log('No center button found');
  };

  const handleZoomIn = () => {
    const treeContainer = findFamilyTreeContainer();
    if (treeContainer) {
      const buttons = Array.from(treeContainer.querySelectorAll('button'));
      const zoomInButton = buttons.find(btn =>
        btn.textContent?.includes('Zoom In')
      );

      if (zoomInButton) {
        zoomInButton.click();
        console.log('Clicked existing zoom in button');
        return;
      }
    }

    // Fallback: Try to trigger wheel event for zoom
    const svg = treeContainer?.querySelector('svg') as SVGElement;
    if (svg) {
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100, // Negative for zoom in
        bubbles: true,
        cancelable: true
      });
      svg.dispatchEvent(wheelEvent);
      console.log('Triggered synthetic wheel event for zoom in');
    }
  };

  const handleZoomOut = () => {
    const treeContainer = findFamilyTreeContainer();
    if (treeContainer) {
      const buttons = Array.from(treeContainer.querySelectorAll('button'));
      const zoomOutButton = buttons.find(btn =>
        btn.textContent?.includes('Zoom Out')
      );

      if (zoomOutButton) {
        zoomOutButton.click();
        console.log('Clicked existing zoom out button');
        return;
      }
    }

    // Fallback: Try to trigger wheel event for zoom
    const svg = treeContainer?.querySelector('svg') as SVGElement;
    if (svg) {
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100, // Positive for zoom out
        bubbles: true,
        cancelable: true
      });
      svg.dispatchEvent(wheelEvent);
      console.log('Triggered synthetic wheel event for zoom out');
    }
  };

  return (
    <div className="family-tree-modal-overlay">
      <div className="family-tree-modal-content">
        {/* Close button */}
        <button
          className="family-tree-modal-close-btn"
          onClick={props.onClose}
          aria-label="Close fullscreen family tree"
        >
          &times;
        </button>

        {/* Simplified Navigation Controls */}
        <div className="family-tree-navigation-controls">
          {/* Directional Navigation */}
          <div className="navigation-arrows">
            <button
              className="nav-btn nav-btn-up"
              onClick={() => handleNavigate('up')}
              aria-label="Pan up"
              title="Pan up"
            >
              ↑
            </button>
            <div className="nav-horizontal">
              <button
                className="nav-btn nav-btn-left"
                onClick={() => handleNavigate('left')}
                aria-label="Pan left"
                title="Pan left"
              >
                ←
              </button>
              <button
                className="nav-btn nav-btn-center"
                onClick={handleCenterView}
                aria-label="Center view"
                title="Center view"
              >
                ⌂
              </button>
              <button
                className="nav-btn nav-btn-right"
                onClick={() => handleNavigate('right')}
                aria-label="Pan right"
                title="Pan right"
              >
                →
              </button>
            </div>
            <button
              className="nav-btn nav-btn-down"
              onClick={() => handleNavigate('down')}
              aria-label="Pan down"
              title="Pan down"
            >
              ↓
            </button>
          </div>

          {/* Quick Zoom Controls */}
          <div className="zoom-controls">
            <button
              className="nav-btn zoom-btn"
              onClick={handleZoomIn}
              aria-label="Zoom in"
              title="Zoom in"
            >
              +
            </button>
            <button
              className="nav-btn zoom-btn"
              onClick={handleZoomOut}
              aria-label="Zoom out"
              title="Zoom out"
            >
              −
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="navigation-instructions">
          Use arrow keys or buttons to pan • +/- buttons for quick zoom • ESC to close
        </div>

        {/* Family Tree Container */}
        <div
          ref={containerRef}
          className="family-tree-scrollable-container"
        >
          <FamilyTree
            {...props}
            externalPan={externalPan}
            onCloseTreeView={props.onClose}
          />
        </div>
      </div>
    </div>
  );
};

export default FamilyTreeModal;