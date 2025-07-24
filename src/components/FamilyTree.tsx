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
  processed: boolean;
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

  // Layout constants
  const CARD_WIDTH = 180;
  const CARD_HEIGHT = 120;
  const HORIZONTAL_SPACING = 280; // Increased space between siblings
  const VERTICAL_SPACING = 200; // Space between generations
  const SPOUSE_SPACING = 220; // Space between spouses
  const FAMILY_GROUP_SPACING = 350; // Space between disconnected family groups
  const MIN_CHILD_SPACING = 250; // Minimum space between children

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

  const treeNodes: TreeNode[] = useMemo(() => {
    if (familyMembers.length === 0) return [];

    // Initialize nodes
    const nodeMap = new Map<string, TreeNode>();
    familyMembers.forEach(member => {
      nodeMap.set(member.id, {
        member,
        x: 0,
        y: 0,
        generation: 0,
        children: [],
        parents: [],
        spouses: [],
        siblings: [],
        processed: false
      });
    });

    // Populate relationships
    nodeMap.forEach((node) => {
      const relations = relationshipMap.get(node.member.id);
      if (relations) {
        node.parents = relations.parents.map(p => nodeMap.get(p.member.id)!).filter(Boolean);
        node.children = relations.children.map(c => nodeMap.get(c.member.id)!).filter(Boolean);
        node.spouses = relations.spouses.map(s => nodeMap.get(s.member.id)!).filter(Boolean);
        node.siblings = relations.siblings.map(s => nodeMap.get(s.member.id)!).filter(Boolean);
      }
    });

    // Find connected components (family groups)
    const familyGroups: TreeNode[][] = [];
    const visited = new Set<string>();
    
    nodeMap.forEach((node) => {
      if (!visited.has(node.member.id)) {
        const group: TreeNode[] = [];
        const queue = [node];
        visited.add(node.member.id);
        
        while (queue.length > 0) {
          const current = queue.shift()!;
          group.push(current);
          
          [...current.parents, ...current.children, ...current.spouses, ...current.siblings]
            .forEach((related) => {
              if (related && !visited.has(related.member.id)) {
                visited.add(related.member.id);
                queue.push(related);
              }
            });
        }
        familyGroups.push(group);
      }
    });

    let totalLayoutWidth = 100; // Starting margin

    // Process each family group
    familyGroups.forEach((group, groupIndex) => {
      // Reset processed flag for this group
      group.forEach(node => node.processed = false);

      // Find root nodes (oldest generation - those with no parents in this group)
      const groupSet = new Set(group.map(n => n.member.id));
      const roots = group.filter(n => 
        n.parents.filter(p => groupSet.has(p.member.id)).length === 0
      );
      
      if (roots.length === 0 && group.length > 0) {
        // If no clear root, pick the person with the earliest birth date
        const sortedByAge = [...group].sort((a, b) => {
          const aDate = a.member.birth_date || '1900-01-01';
          const bDate = b.member.birth_date || '1900-01-01';
          return aDate.localeCompare(bDate);
        });
        roots.push(sortedByAge[0]);
      }

      // Assign generations using BFS
      const assignGenerations = () => {
        const processed = new Set<string>();
        const queue = roots.map(root => ({ node: root, generation: 0 }));
        
        while (queue.length > 0) {
          const { node, generation } = queue.shift()!;
          
          if (processed.has(node.member.id)) continue;
          processed.add(node.member.id);
          
          node.generation = generation;
          
          // Add children to next generation
          node.children
            .filter(child => groupSet.has(child.member.id) && !processed.has(child.member.id))
            .forEach(child => {
              queue.push({ node: child, generation: generation + 1 });
            });
        }
        
        // Ensure all nodes have a generation assigned
        group.forEach(node => {
          if (!processed.has(node.member.id)) {
            node.generation = Math.max(0, Math.max(...group.filter(n => processed.has(n.member.id)).map(n => n.generation)) + 1);
          }
        });
      };

      assignGenerations();

      // Group by generation
      const generationMap = new Map<number, TreeNode[]>();
      group.forEach(node => {
        if (!generationMap.has(node.generation)) {
          generationMap.set(node.generation, []);
        }
        generationMap.get(node.generation)!.push(node);
      });

      // Sort generations
      const generations = Array.from(generationMap.keys()).sort((a, b) => a - b);
      
      // Position nodes by generation
      let groupMinX = totalLayoutWidth;
      let groupMaxX = totalLayoutWidth;

      generations.forEach((gen, genIndex) => {
        const genNodes = generationMap.get(gen)!;
        const positionedInGen = new Set<string>();
        let currentXInGen = totalLayoutWidth;

        // Process spouse pairs and sibling groups
        genNodes.forEach(person => {
          if (positionedInGen.has(person.member.id)) return;

          // Create family unit (person + spouses + siblings)
          const familyUnit: TreeNode[] = [person];
          
          // Add spouses
          person.spouses.forEach(spouse => {
            if (groupSet.has(spouse.member.id) && spouse.generation === gen && !positionedInGen.has(spouse.member.id)) {
              familyUnit.push(spouse);
            }
          });

          // Add siblings (only if they don't have spouses already processed)
          person.siblings.forEach(sibling => {
            if (groupSet.has(sibling.member.id) && sibling.generation === gen && !positionedInGen.has(sibling.member.id)) {
              // Check if sibling has spouses that would create a separate unit
              const siblingHasUnprocessedSpouses = sibling.spouses.some(spouse => 
                groupSet.has(spouse.member.id) && spouse.generation === gen && !positionedInGen.has(spouse.member.id)
              );
              
              if (!siblingHasUnprocessedSpouses) {
                familyUnit.push(sibling);
              }
            }
          });

          // Sort family unit for consistent positioning
          familyUnit.sort((a, b) => {
            // Prioritize by relationship (spouses together), then by name
            const aName = `${a.member.first_name} ${a.member.last_name}`;
            const bName = `${b.member.first_name} ${b.member.last_name}`;
            return aName.localeCompare(bName);
          });

          // Position family unit
          familyUnit.forEach((member, unitIndex) => {
            member.x = currentXInGen + (unitIndex * SPOUSE_SPACING);
            member.y = gen * VERTICAL_SPACING + 100;
            positionedInGen.add(member.member.id);
          });

          currentXInGen += familyUnit.length * SPOUSE_SPACING + MIN_CHILD_SPACING;
          groupMaxX = Math.max(groupMaxX, currentXInGen - HORIZONTAL_SPACING);
        });

        // Center children under their parents
        if (genIndex > 0) {
          genNodes.forEach(child => {
            const parentsInGroup = child.parents.filter(p => groupSet.has(p.member.id));
            
            if (parentsInGroup.length > 0) {
              // Calculate center point of parents
              const parentCenterX = parentsInGroup.reduce((sum, p) => sum + p.x, 0) / parentsInGroup.length;
              
              // Get all children of these parents in this generation
              const allChildrenOfParents = new Set<TreeNode>();
              parentsInGroup.forEach(parent => {
                parent.children.forEach(childOfParent => {
                  if (groupSet.has(childOfParent.member.id) && childOfParent.generation === gen) {
                    allChildrenOfParents.add(childOfParent);
                  }
                });
              });

              const childrenArray = Array.from(allChildrenOfParents).sort((a, b) => a.x - b.x);
              
              if (childrenArray.length > 1) {
                // Calculate required space for all children
                const requiredChildWidth = (childrenArray.length - 1) * MIN_CHILD_SPACING;
                const startX = parentCenterX - (requiredChildWidth / 2);
                
                // Ensure children don't overlap with existing positioned nodes
                let adjustedStartX = startX;
                const existingPositions = genNodes
                  .filter(n => !childrenArray.includes(n))
                  .map(n => n.x)
                  .sort((a, b) => a - b);
                
                // Check for conflicts and adjust if necessary
                for (let i = 0; i < childrenArray.length; i++) {
                  const proposedX = adjustedStartX + (i * MIN_CHILD_SPACING);
                  const tooClose = existingPositions.some(pos => 
                    Math.abs(pos - proposedX) < MIN_CHILD_SPACING
                  );
                  
                  if (tooClose) {
                    // Find a safe position
                    const maxExisting = Math.max(...existingPositions, ...childrenArray.map(c => c.x));
                    adjustedStartX = maxExisting + MIN_CHILD_SPACING - (i * MIN_CHILD_SPACING);
                    break;
                  }
                }
                
                // Position children with proper spacing
                childrenArray.forEach((childNode, index) => {
                  childNode.x = adjustedStartX + (index * MIN_CHILD_SPACING);
                });
              } else if (childrenArray.length === 1) {
                // Single child - center under parents, but ensure no overlap
                let proposedX = parentCenterX;
                const existingPositions = genNodes
                  .filter(n => n !== childrenArray[0])
                  .map(n => n.x);
                
                const tooClose = existingPositions.some(pos => 
                  Math.abs(pos - proposedX) < MIN_CHILD_SPACING
                );
                
                if (tooClose) {
                  // Find nearest safe position
                  const sortedPositions = existingPositions.sort((a, b) => a - b);
                  let safeX = proposedX;
                  
                  for (const pos of sortedPositions) {
                    if (Math.abs(pos - safeX) < MIN_CHILD_SPACING) {
                      safeX = pos > safeX ? pos - MIN_CHILD_SPACING : pos + MIN_CHILD_SPACING;
                    }
                  }
                  proposedX = safeX;
                }
                
                childrenArray[0].x = proposedX;
              }
            }
          });
        }
      });

      // Update total width for next family group
      totalLayoutWidth = groupMaxX + FAMILY_GROUP_SPACING;
    });

    return Array.from(nodeMap.values());
  }, [familyMembers, relationships, relationshipMap]);

  // Handle mouse events for pan and zoom
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target === svgRef.current || target.tagName === 'svg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
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
    event.preventDefault();
    
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;

    const clientX = event.clientX;
    const clientY = event.clientY;
    const popupWidth = 380;
    const popupHeight = 600;

    let popupLeft = clientX - svgRect.left;
    let popupTop = clientY - svgRect.top;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (clientX + popupWidth > viewportWidth - 20) {
      popupLeft = viewportWidth - popupWidth - 20; 
    } else if (clientX < 20) {
      popupLeft = 20;
    }

    if (clientY + popupHeight > viewportHeight - 20) {
      popupTop = viewportHeight - popupHeight - 20;
    } else if (clientY < 20) {
      popupTop = 20;
    }

    popupLeft = Math.max(20, popupLeft);
    popupTop = Math.max(20, popupTop);

    setPopupPosition({ x: popupLeft, y: popupTop });
    setShowMemberPopup(member);
    onSelectMember(member);
  };

  const closePopup = () => {
    setShowMemberPopup(null);
  };

  const generateConnections = () => {
    const lines: JSX.Element[] = [];

    treeNodes.forEach((node) => {
      // Parent-child connections with proper routing
      node.children.forEach((child) => {
        const parentY = node.y + CARD_HEIGHT/2;
        const childY = child.y - CARD_HEIGHT/2;
        const midY = parentY + (childY - parentY) / 2;

        // Direct line from parent to child
        lines.push(
          <path
            key={`parent-child-${node.member.id}-${child.member.id}`}
            d={`M ${node.x} ${parentY} L ${node.x} ${midY} L ${child.x} ${midY} L ${child.x} ${childY}`}
            className="connection-parent"
            fill="none"
            stroke="#4F46E5"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
          />
        );
      });

      // Spouse connections (horizontal lines)
      node.spouses.forEach((spouse) => {
        if (node.member.id < spouse.member.id) { // Prevent duplicate lines
          const leftX = Math.min(node.x, spouse.x) + CARD_WIDTH/2;
          const rightX = Math.max(node.x, spouse.x) - CARD_WIDTH/2;
          const y = node.y;
          
          lines.push(
            <line
              key={`spouse-${node.member.id}-${spouse.member.id}`}
              x1={leftX}
              y1={y}
              x2={rightX}
              y2={y}
              className="connection-spouse"
              stroke="#E11D48"
              strokeWidth="3"
            />
          );
        }
      });
    });

    // Process sibling connections
    const processedSiblingGroups = new Set<string>();
    treeNodes.forEach((node) => {
      if (node.siblings.length > 0) {
        const siblingGroup = [node, ...node.siblings];
        const groupIds = siblingGroup.map(s => s.member.id).sort().join('-');
        
        if (processedSiblingGroups.has(groupIds)) return;
        processedSiblingGroups.add(groupIds);

        // Filter siblings in same generation and sort by x position
        const sameGenSiblings = siblingGroup
          .filter(s => s.generation === node.generation)
          .sort((a, b) => a.x - b.x);

        if (sameGenSiblings.length > 1) {
          const y = sameGenSiblings[0].y + 10; // Slightly below center
          
          for (let i = 0; i < sameGenSiblings.length - 1; i++) {
            const current = sameGenSiblings[i];
            const next = sameGenSiblings[i + 1];
            
            lines.push(
              <line
                key={`sibling-${current.member.id}-${next.member.id}`}
                x1={current.x + CARD_WIDTH/2}
                y1={y}
                x2={next.x - CARD_WIDTH/2}
                y2={y}
                className="connection-sibling"
                stroke="#059669"
                strokeWidth="2"
              />
            );
          }
        }
      }
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
        style={{ userSelect: 'none' }}
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
          {generateConnections()}

          {treeNodes.map(node => (
            <g 
              key={node.member.id} 
              transform={`translate(${node.x - CARD_WIDTH/2}, ${node.y - CARD_HEIGHT/2})`}
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''}`}
              onClick={(e) => handleMemberClick(node.member, e)}
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
            >
              {/* Card background with shadow */}
              <rect
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                rx="12"
                fill={selectedMember?.id === node.member.id ? '#EEF2FF' : '#FFFFFF'}
                stroke={selectedMember?.id === node.member.id ? '#6366F1' : '#E5E7EB'}
                strokeWidth={selectedMember?.id === node.member.id ? '3' : '1'}
                filter="url(#cardShadow)"
                style={{ pointerEvents: 'all' }}
              />
              
              {/* Plus button for adding relationships */}
              <circle
                cx={CARD_WIDTH - 15}
                cy={15}
                r="10"
                fill="#3B82F6"
                stroke="#FFFFFF"
                strokeWidth="2"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddRelatedMember(node.member);
                }}
              />
              <text
                x={CARD_WIDTH - 15}
                y={20}
                textAnchor="middle"
                fill="white"
                fontSize="14"
                fontWeight="bold"
                style={{ pointerEvents: 'none' }}
              >
                +
              </text>
              
              {/* Member name */}
              <text
                x={CARD_WIDTH/2}
                y="25"
                textAnchor="middle"
                className="member-name-first"
                fill="#1F2937"
                fontSize="14"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.first_name}
              </text>
              <text
                x={CARD_WIDTH/2}
                y="42"
                textAnchor="middle"
                className="member-name-last"
                fill="#1F2937"
                fontSize="14"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.last_name}
              </text>
              
              {/* Birth year */}
              {node.member.birth_date && (
                <text
                  x={CARD_WIDTH/2}
                  y="60"
                  textAnchor="middle"
                  className="member-date"
                  fill="#6B7280"
                  fontSize="11"
                  style={{ pointerEvents: 'none' }}
                >
                  Born: {new Date(node.member.birth_date).getFullYear()}
                </text>
              )}
              
              {/* Death year */}
              {node.member.death_date && (
                <text
                  x={CARD_WIDTH/2}
                  y={node.member.birth_date ? "75" : "60"}
                  textAnchor="middle"
                  className="member-date"
                  fill="#6B7280"
                  fontSize="11"
                  style={{ pointerEvents: 'none' }}
                >
                  Died: {new Date(node.member.death_date).getFullYear()}
                </text>
              )}

              {/* Gender indicator */}
              <text
                x={CARD_WIDTH/2}
                y={CARD_HEIGHT - 15}
                textAnchor="middle"
                className="member-gender"
                fill="#9CA3AF"
                fontSize="10"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.gender}
              </text>

              {/* Living indicator */}
              {!node.member.death_date && (
                <circle
                  cx={15}
                  cy={CARD_HEIGHT - 15}
                  r="4"
                  fill="#3B82F6"
                />
              )}
            </g>
          ))}
        </g>

        {/* Add shadow filter definition */}
        <defs>
          <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.2"/>
          </filter>
        </defs>
      </svg>

      {/* Legend */}
      <div className="legend">
        <div className="legend-item">
          <div className="legend-line" style={{ backgroundColor: '#4F46E5', height: '3px', width: '20px' }}></div>
          <span>Parent-Child</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ backgroundColor: '#E11D48', height: '3px', width: '20px' }}></div>
          <span>Spouse</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ backgroundColor: '#059669', height: '3px', width: '20px' }}></div>
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
                </div>
              );
            })()}
          </div>

          <div className="popup-actions">
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