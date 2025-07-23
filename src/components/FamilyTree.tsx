import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { FamilyMember, Relationship } from '../types';
import '../assets/FamilyTree.css';

interface FamilyTreeProps {
  familyMembers: FamilyMember[];
  relationships: Relationship[];
  onDeleteMember: (memberId: string) => void;
  onSelectMember: (member: FamilyMember) => void;
  selectedMember: FamilyMember | null;
  onDeleteRelationship: (relationshipId: string) => void;
  onAddMember: () => void;
  onAddRelatedMember: (member: FamilyMember) => void;
  onAddExistingRelationship: (member: FamilyMember) => void;
}

interface TreeNode {
  member: FamilyMember;
  x: number;
  y: number;
  generation: number;
  children: TreeNode[];
  parents: TreeNode[];
  spouses: TreeNode[];
  siblings: TreeNode[];
}

const FamilyTree: React.FC<FamilyTreeProps> = ({
  familyMembers,
  relationships,
  onDeleteMember,
  onSelectMember,
  selectedMember,
  onDeleteRelationship,
  onAddMember,
  onAddRelatedMember,
  onAddExistingRelationship
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showMemberPopup, setShowMemberPopup] = useState<FamilyMember | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const svgRef = useRef<SVGSVGElement>(null);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Build relationship maps
  const relationshipMap = useMemo(() => {
    const map = new Map<string, {
      parents: { member: FamilyMember; relationship: Relationship }[];
      children: { member: FamilyMember; relationship: Relationship }[];
      spouses: { member: FamilyMember; relationship: Relationship }[];
      siblings: { member: FamilyMember; relationship: Relationship }[];
    }>();

    familyMembers.forEach(member => {
      map.set(member.id, {
        parents: [],
        children: [],
        spouses: [],
        siblings: []
      });
    });

    relationships.forEach(rel => {
      const person1 = familyMembers.find(m => m.id === rel.person1_id);
      const person2 = familyMembers.find(m => m.id === rel.person2_id);
      
      if (!person1 || !person2) return;

      const person1Relations = map.get(rel.person1_id)!;
      const person2Relations = map.get(rel.person2_id)!;

      switch (rel.relationship_type) {
        case 'parent':
          if (!person1Relations.children.find(c => c.member.id === person2.id)) {
            person1Relations.children.push({ member: person2, relationship: rel });
          }
          if (!person2Relations.parents.find(p => p.member.id === person1.id)) {
            person2Relations.parents.push({ member: person1, relationship: rel });
          }
          break;
        case 'child':
          if (!person1Relations.parents.find(p => p.member.id === person2.id)) {
            person1Relations.parents.push({ member: person2, relationship: rel });
          }
          if (!person2Relations.children.find(c => c.member.id === person1.id)) {
            person2Relations.children.push({ member: person1, relationship: rel });
          }
          break;
        case 'spouse':
          if (!person1Relations.spouses.find(s => s.member.id === person2.id)) {
            person1Relations.spouses.push({ member: person2, relationship: rel });
          }
          if (!person2Relations.spouses.find(s => s.member.id === person1.id)) {
            person2Relations.spouses.push({ member: person1, relationship: rel });
          }
          break;
        case 'sibling':
          if (!person1Relations.siblings.find(s => s.member.id === person2.id)) {
            person1Relations.siblings.push({ member: person2, relationship: rel });
          }
          if (!person2Relations.siblings.find(s => s.member.id === person1.id)) {
            person2Relations.siblings.push({ member: person1, relationship: rel });
          }
      }
    });

    return map;
  }, [familyMembers, relationships]);

  // Build tree layout with improved positioning
  const treeNodes = useMemo(() => {
    if (familyMembers.length === 0) return [];

    const nodeMap = new Map<string, TreeNode>();
    
    // Responsive card dimensions based on screen size
    const CARD_WIDTH = Math.min(200, dimensions.width * 0.15);
    const CARD_HEIGHT = Math.min(140, dimensions.height * 0.12);
    const HORIZONTAL_SPACING = CARD_WIDTH + 200; // Increased spacing for wider tree
    const VERTICAL_SPACING = CARD_HEIGHT + 80; // Increased spacing

    // Create nodes for all members first
    familyMembers.forEach(member => {
      nodeMap.set(member.id, {
        member,
        x: 0,
        y: 0,
        generation: 0,
        children: [],
        parents: [],
        spouses: [],
        siblings: []
      });
    });

    // Find root members (those without parents)
    const rootMembers = familyMembers.filter(member => {
      const relations = relationshipMap.get(member.id);
      return !relations || relations.parents.length === 0;
    });

    if (rootMembers.length === 0 && familyMembers.length > 0) {
      rootMembers.push(familyMembers[0]);
    }

    // Assign generations using BFS to avoid conflicts
    const assignGenerations = () => {
      const visited = new Set<string>();
      const queue: { id: string; generation: number }[] = [];
      
      // Start with root members at generation 0
      rootMembers.forEach(root => {
        queue.push({ id: root.id, generation: 0 });
      });

      while (queue.length > 0) {
        const { id, generation } = queue.shift()!;
        
        if (visited.has(id)) continue;
        visited.add(id);

        const node = nodeMap.get(id)!;
        node.generation = generation;

        const relations = relationshipMap.get(id);
        if (relations) {
          // Children go to next generation
          relations.children.forEach(child => {
            if (!visited.has(child.member.id)) {
              queue.push({ id: child.member.id, generation: generation + 1 });
            }
          });
          
          // Spouses stay in same generation
          relations.spouses.forEach(spouse => {
            if (!visited.has(spouse.member.id)) {
              queue.push({ id: spouse.member.id, generation: generation });
            }
          });
          
          // Siblings stay in same generation
          relations.siblings.forEach(sibling => {
            if (!visited.has(sibling.member.id)) {
              queue.push({ id: sibling.member.id, generation: generation });
            }
          });
        }
      }
    };

    assignGenerations();

    // Group members by generation
    const generationGroups = new Map<number, string[]>();
    nodeMap.forEach((node, id) => {
      const gen = node.generation;
      if (!generationGroups.has(gen)) {
        generationGroups.set(gen, []);
      }
      generationGroups.get(gen)!.push(id);
    });

    // Position nodes by generation
    const centerX = dimensions.width / 2;
    
    generationGroups.forEach((memberIds, generation) => {
      const generationY = generation * VERTICAL_SPACING + 100;
      const totalWidth = memberIds.length * HORIZONTAL_SPACING;
      let startX = centerX - totalWidth / 2;

      // Sort siblings together and spouses close to each other
      const sortedMembers = [...memberIds].sort((a, b) => {
        const nodeA = nodeMap.get(a)!;
        const nodeB = nodeMap.get(b)!;
        
        // Try to keep family units together
        const relationsA = relationshipMap.get(a);
        const relationsB = relationshipMap.get(b);
        
        if (relationsA && relationsB) {
          // Check if they are spouses
          const isSpouse = relationsA.spouses.some(s => s.member.id === b);
          if (isSpouse) return a < b ? -1 : 1; // Keep spouses adjacent
          
          // Check if they are siblings
          const isSibling = relationsA.siblings.some(s => s.member.id === b);
          if (isSibling) return a < b ? -1 : 1; // Keep siblings adjacent
        }
        
        return a.localeCompare(b); // Default sort
      });

      sortedMembers.forEach((memberId, index) => {
        const node = nodeMap.get(memberId)!;
        node.x = startX + (index * HORIZONTAL_SPACING) + HORIZONTAL_SPACING / 2;
        node.y = generationY;
      });
    });

    // Build relationship connections
    familyMembers.forEach(member => {
      const node = nodeMap.get(member.id)!;
      const relations = relationshipMap.get(member.id);
      
      if (relations) {
        node.parents = relations.parents.map(p => nodeMap.get(p.member.id)!).filter(Boolean);
        node.children = relations.children.map(c => nodeMap.get(c.member.id)!).filter(Boolean);
        node.spouses = relations.spouses.map(s => nodeMap.get(s.member.id)!).filter(Boolean);
        node.siblings = relations.siblings.map(s => nodeMap.get(s.member.id)!).filter(Boolean);
      }
    });

    return Array.from(nodeMap.values());
  }, [familyMembers, relationshipMap, dimensions]);

  // Handle mouse events for pan and zoom - FIXED VERSION
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start dragging if clicking on the SVG background, not on any member cards
    const target = e.target as Element;
    if (target === svgRef.current || target.tagName === 'svg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault(); // Prevent text selection
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault(); // Prevent any default behavior during drag
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)));
  }, []);

  const handleMemberClick = (member: FamilyMember, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault(); // Prevent any unwanted side effects
    
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;

    // Calculate the position relative to the SVG container
    // Adjust for current pan and zoom
    const clientX = event.clientX;
    const clientY = event.clientY;

    // Get the actual position of the clicked member card within the SVG coordinate system
    // This requires knowing the member card's rendered position (node.x, node.y) and its dimensions
    // For simplicity, we'll try to position the popup near the click event, but relative to the SVG
    
    // Transform client coordinates to SVG coordinates
    const svgX = (clientX - svgRect.left - pan.x) / zoom;
    const svgY = (clientY - svgRect.top - pan.y) / zoom;

    // Desired popup dimensions
    const popupWidth = 380; // As defined in CSS
    const popupHeight = 600; // Max height, will adjust based on content

    // Calculate initial popup position relative to the SVG's top-left corner
    let popupLeft = clientX - svgRect.left;
    let popupTop = clientY - svgRect.top;

    // Adjust for pan and zoom to keep it relative to the viewport
    // We want the popup to appear near the clicked element, but fixed on the screen
    // So, we use clientX/Y directly for positioning relative to the viewport
    // and then adjust if it goes off-screen.

    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust if popup goes off screen (relative to viewport)
    if (clientX + popupWidth > viewportWidth - 20) { // 20px margin from right
      popupLeft = viewportWidth - popupWidth - 20; 
    } else if (clientX < 20) { // 20px margin from left
      popupLeft = 20;
    }

    if (clientY + popupHeight > viewportHeight - 20) { // 20px margin from bottom
      popupTop = viewportHeight - popupHeight - 20;
    } else if (clientY < 20) { // 20px margin from top
      popupTop = 20;
    }

    // Ensure minimum position
    popupLeft = Math.max(20, popupLeft);
    popupTop = Math.max(20, popupTop);

    setPopupPosition({ x: popupLeft, y: popupTop });
    setShowMemberPopup(member);
    onSelectMember(member);
  };

  const closePopup = () => {
    setShowMemberPopup(null);
  };

  // Generate connection lines
  const generateConnections = () => {
    const lines: JSX.Element[] = [];
    const CARD_WIDTH = Math.min(200, dimensions.width * 0.15);
    const CARD_HEIGHT = Math.min(140, dimensions.height * 0.12);

    treeNodes.forEach(node => {
      // Parent-child connections
      node.children.forEach(child => {
        lines.push(
          <line
            key={`parent-${node.member.id}-${child.member.id}`}
            x1={node.x}
            y1={node.y + CARD_HEIGHT/2}
            x2={child.x}
            y2={child.y - CARD_HEIGHT/2}
            className="connection-parent"
            markerEnd="url(#arrowhead)"
            style={{ pointerEvents: 'none' }} // Prevent interference with hover
          />
        );
      });

      // Spouse connections
      node.spouses.forEach(spouse => {
        if (node.member.id < spouse.member.id) { // Avoid duplicate lines
          const distance = Math.abs(node.x - spouse.x);
          const connectionOffset = Math.min(CARD_WIDTH/2 - 10, distance/4);
          
          lines.push(
            <line
              key={`spouse-${node.member.id}-${spouse.member.id}`}
              x1={node.x + (node.x < spouse.x ? connectionOffset : -connectionOffset)}
              y1={node.y}
              x2={spouse.x + (spouse.x < node.x ? connectionOffset : -connectionOffset)}
              y2={spouse.y}
              className="connection-spouse"
              style={{ pointerEvents: 'none' }} // Prevent interference with hover
            />
          );
        }
      });

      // Sibling connections
      node.siblings.forEach(sibling => {
        if (node.member.id < sibling.member.id && node.generation === sibling.generation) {
          const midY = (node.y + sibling.y) / 2 - CARD_HEIGHT/3;
          lines.push(
            <g key={`sibling-${node.member.id}-${sibling.member.id}`} style={{ pointerEvents: 'none' }}>
              <line
                x1={node.x}
                y1={node.y - CARD_HEIGHT/2}
                x2={node.x}
                y2={midY}
                className="connection-sibling"
              />
              <line
                x1={node.x}
                y1={midY}
                x2={sibling.x}
                y2={midY}
                className="connection-sibling"
              />
              <line
                x1={sibling.x}
                y1={midY}
                x2={sibling.x}
                y2={sibling.y - CARD_HEIGHT/2}
                className="connection-sibling"
              />
            </g>
          );
        }
      });
    });

    return lines;
  };

  if (familyMembers.length === 0) {
    return (
      <div className="empty-state">
        <h2>Family Tree</h2>
        <p>No family members added yet. Add some to see the tree!</p>
      </div>
    );
  }

  const CARD_WIDTH = Math.min(200, dimensions.width * 0.15);
  const CARD_HEIGHT = Math.min(140, dimensions.height * 0.12);

  return (
    <div className="family-tree-container">
      <div className="family-tree-controls">
        <button
          onClick={() => setZoom(prev => Math.min(3, prev * 1.2))}
          className="control-button"
        >
          Zoom In
        </button>
        <button
          onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))}
          className="control-button"
        >
          Zoom Out
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="control-button secondary"
        >
          Reset View
        </button>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className={`family-tree-svg ${isDragging ? 'dragging' : 'grabbable'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ userSelect: 'none' }} // Prevent text selection
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#4F46E5"
            />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Connection lines */}
          {generateConnections()}

          {/* Family member cards */}
          {treeNodes.map(node => (
            <g 
              key={node.member.id} 
              transform={`translate(${node.x - CARD_WIDTH/2}, ${node.y - CARD_HEIGHT/2})`}
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''}`}
              onClick={(e) => handleMemberClick(node.member, e)}
              style={{ cursor: 'pointer', pointerEvents: 'all' }} // Ensure proper cursor and interaction
            >
              <rect
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                rx="16"
                fill={selectedMember?.id === node.member.id ? '#EEF2FF' : '#FFFFFF'}
                stroke={'#D1D5DB'}
                strokeWidth={'2'}
                className={`member-card-bg ${selectedMember?.id === node.member.id ? 'selected' : ''}`}
                style={{ pointerEvents: 'all' }} // Ensure rect is clickable
              />
              
              <text
                x={CARD_WIDTH/2}
                y="32"
                textAnchor="middle"
                className="member-name-first"
                style={{ pointerEvents: 'none' }} // Text should not interfere with clicks
              >
                {node.member.first_name}
              </text>
              <text
                x={CARD_WIDTH/2}
                y="54"
                textAnchor="middle"
                className="member-name-last"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.last_name}
              </text>
              
              <text
                x={CARD_WIDTH/2}
                y="76"
                textAnchor="middle"
                className="member-gender"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.gender}
              </text>
              
              {node.member.birth_date && (
                <text
                  x={CARD_WIDTH/2}
                  y="94"
                  textAnchor="middle"
                  className="member-date"
                  style={{ pointerEvents: 'none' }}
                >
                  Born: {new Date(node.member.birth_date).toLocaleDateString()}
                </text>
              )}
              
              {node.member.death_date && (
                <text
                  x={CARD_WIDTH/2}
                  y={node.member.birth_date ? "112" : "94"}
                  textAnchor="middle"
                  className="member-date"
                  style={{ pointerEvents: 'none' }}
                >
                  Died: {new Date(node.member.death_date).toLocaleDateString()}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>

      {/* Legend */}
      <div className="legend">
        <div className="legend-item">
          <div className="legend-line parent"></div>
          <span>Parent-Child</span>
        </div>
        <div className="legend-item">
          <div className="legend-line spouse"></div>
          <span>Spouse</span>
        </div>
        <div className="legend-item">
          <div className="legend-line sibling"></div>
          <span>Sibling</span>
        </div>
      </div>

      {/* Member popup */}
      {showMemberPopup && (
        <div
          className="member-popup"
          style={{
            left: popupPosition.x,
            top: popupPosition.y,
          }}
        >
          <div className="popup-header">
            <h3 className="popup-title">
              {showMemberPopup.first_name} {showMemberPopup.last_name}
            </h3>
            <button
              onClick={closePopup}
              className="popup-close"
            >
              ×
            </button>
          </div>

          <div className="relationships-section">
            <h4 className="relationships-title">Direct Relationships</h4>
            {(() => {
              const relations = relationshipMap.get(showMemberPopup.id);
              if (!relations) return <p>No relationships found.</p>;

              return (
                <div>
                  <div className="relationship-group">
                    <div className="relationship-label">Parents:</div>
                    {relations.parents.length > 0 ? (
                      <ul className="relationship-list">
                        {relations.parents.map(({ member: p, relationship: rel }) => (
                          <li key={p.id} className="relationship-item">
                            <span className="relationship-name">{p.first_name} {p.last_name}</span>
                            <button
                              onClick={() => onDeleteRelationship(rel.id)}
                              className="delete-relationship-btn"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="relationship-none">None</span>
                    )}
                  </div>

                  <div className="relationship-group">
                    <div className="relationship-label">Spouses:</div>
                    {relations.spouses.length > 0 ? (
                      <ul className="relationship-list">
                        {relations.spouses.map(({ member: s, relationship: rel }) => (
                          <li key={s.id} className="relationship-item">
                            <span className="relationship-name">{s.first_name} {s.last_name}</span>
                            <button
                              onClick={() => onDeleteRelationship(rel.id)}
                              className="delete-relationship-btn"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="relationship-none">None</span>
                    )}
                  </div>

                  <div className="relationship-group">
                    <div className="relationship-label">Children:</div>
                    {relations.children.length > 0 ? (
                      <ul className="relationship-list">
                        {relations.children.map(({ member: c, relationship: rel }) => (
                          <li key={c.id} className="relationship-item">
                            <span className="relationship-name">{c.first_name} {c.last_name}</span>
                            <button
                              onClick={() => onDeleteRelationship(rel.id)}
                              className="delete-relationship-btn"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="relationship-none">None</span>
                    )}
                  </div>

                  <div className="relationship-group">
                    <div className="relationship-label">Siblings:</div>
                    {relations.siblings.length > 0 ? (
                      <ul className="relationship-list">
                        {relations.siblings.map(({ member: s, relationship: rel }) => (
                          <li key={s.id} className="relationship-item">
                            <span className="relationship-name">{s.first_name} {s.last_name}</span>
                            <button
                              onClick={() => onDeleteRelationship(rel.id)}
                              className="delete-relationship-btn"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="relationship-none">None</span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="popup-actions">
            <button
              onClick={() => {
                closePopup();
                onAddMember();
              }}
              className="popup-action-btn primary"
            >
              Add New Family Member
            </button>
            <button
              onClick={() => {
                closePopup();
                if (showMemberPopup) onAddRelatedMember(showMemberPopup);
              }}
              className="popup-action-btn success"
            >
              Add Related Member to {showMemberPopup.first_name}
            </button>
            <button
              onClick={() => {
                closePopup();
                if (showMemberPopup) onAddExistingRelationship(showMemberPopup);
              }}
              className="popup-action-btn info"
            >
              Add Existing Relationship to {showMemberPopup.first_name}
            </button>
            <button
              onClick={() => onDeleteMember(showMemberPopup.id)}
              className="popup-action-btn danger"
            >
              Delete {showMemberPopup.first_name}
            </button>
            <button
              onClick={() => {
                onSelectMember(showMemberPopup);
                closePopup();
              }}
              className="popup-action-btn secondary"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyTree;