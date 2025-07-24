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

  const treeNodes: TreeNode[] = useMemo(() => {
    if (familyMembers.length === 0) return [];

    // Define constants for layout
    const CARD_WIDTH = Math.min(200, dimensions.width * 0.15);
    const CARD_HEIGHT = Math.min(140, dimensions.height * 0.12);
    const HORIZONTAL_SPACING = CARD_WIDTH + 100; // Space between siblings
    const SPOUSE_SPACING = CARD_WIDTH + 50; // Space between spouses
    const VERTICAL_SPACING = CARD_HEIGHT + 150; // Space between generations
    const FAMILY_GROUP_SPACING = CARD_WIDTH * 2; // Space between family groups

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
        siblings: []
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

    let totalLayoutWidth = 0;

    // Process each family group
    familyGroups.forEach(group => {
      // Assign generations using BFS from root nodes
      const assignGenerations = () => {
        // Find root nodes (no parents in this group)
        const groupSet = new Set(group.map(n => n.member.id));
        const roots = group.filter(n => 
          n.parents.filter(p => groupSet.has(p.member.id)).length === 0
        );
        
        if (roots.length === 0 && group.length > 0) {
          // If no clear root, pick the oldest person
          roots.push(group.sort((a, b) => 
            (a.member.birth_date || '1900').localeCompare(b.member.birth_date || '1900')
          )[0]);
        }
        
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
            node.generation = 0;
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

      // Position nodes generation by generation
      const generations = Array.from(generationMap.keys()).sort((a, b) => a - b);
      let groupMaxXForGen = totalLayoutWidth;

      generations.forEach(gen => {
        const genNodes = generationMap.get(gen)!;
        
        // Create sibling groups and spouse pairs
        const positionedNodes = new Set<string>();
        let currentX = totalLayoutWidth;

        genNodes.forEach(node => {
          if (positionedNodes.has(node.member.id)) return;

          // Check if this node has siblings in the same generation
          const siblingGroup = [node];
          const groupSet = new Set(group.map(n => n.member.id));
          
          node.siblings
            .filter(sibling => 
              groupSet.has(sibling.member.id) && 
              sibling.generation === gen &&
              !positionedNodes.has(sibling.member.id)
            )
            .forEach(sibling => {
              siblingGroup.push(sibling);
            });

          // Sort siblings consistently
          siblingGroup.sort((a, b) => 
            `${a.member.first_name} ${a.member.last_name}`.localeCompare(
              `${b.member.first_name} ${b.member.last_name}`
            )
          );

          // Position sibling group
          siblingGroup.forEach((sibling, index) => {
            positionedNodes.add(sibling.member.id);
            
            // Handle spouses
            const spouseGroup = [sibling];
            sibling.spouses
              .filter(spouse => 
                groupSet.has(spouse.member.id) && 
                spouse.generation === gen &&
                !positionedNodes.has(spouse.member.id)
              )
              .forEach(spouse => {
                spouseGroup.push(spouse);
                positionedNodes.add(spouse.member.id);
              });

            // Position spouse group
            spouseGroup.forEach((person, spouseIndex) => {
              person.x = currentX + (spouseIndex * SPOUSE_SPACING);
              person.y = gen * VERTICAL_SPACING + 100;
            });

            currentX += (spouseGroup.length * SPOUSE_SPACING) + HORIZONTAL_SPACING;
          });
        });

        groupMaxXForGen = Math.max(groupMaxXForGen, currentX);
      });

      // Center children under parents
      generations.slice(1).forEach(gen => {
        const genNodes = generationMap.get(gen)!;
        
        genNodes.forEach(node => {
          const groupSet = new Set(group.map(n => n.member.id));
          const parentsInGroup = node.parents.filter(p => groupSet.has(p.member.id));
          
          if (parentsInGroup.length > 0) {
            const parentCenterX = parentsInGroup.reduce((sum, p) => sum + p.x, 0) / parentsInGroup.length;
            
            // Get all siblings of this node in the same generation
            const siblingsInGroup = [node, ...node.siblings.filter(s => 
              groupSet.has(s.member.id) && s.generation === gen
            )];
            
            // Remove duplicates and sort
            const uniqueSiblings = Array.from(new Set(siblingsInGroup.map(s => s.member.id)))
              .map(id => siblingsInGroup.find(s => s.member.id === id)!)
              .sort((a, b) => a.x - b.x);

            if (uniqueSiblings.length > 1) {
              // Position sibling group centered under parents
              const groupWidth = (uniqueSiblings.length - 1) * HORIZONTAL_SPACING;
              const startX = parentCenterX - (groupWidth / 2);
              
              uniqueSiblings.forEach((sibling, index) => {
                sibling.x = startX + (index * HORIZONTAL_SPACING);
              });
            } else {
              // Single child, center under parents
              node.x = parentCenterX;
            }
          }
        });
      });

      // Update total width for next family group
      const groupMinX = Math.min(...group.map(n => n.x));
      const groupMaxX = Math.max(...group.map(n => n.x));
      const actualGroupWidth = groupMaxX - groupMinX + CARD_WIDTH;
      
      // Adjust positions to prevent overlap
      if (groupMinX < totalLayoutWidth) {
        const shiftAmount = totalLayoutWidth - groupMinX;
        group.forEach(node => {
          node.x += shiftAmount;
        });
      }
      
      totalLayoutWidth = Math.max(...group.map(n => n.x)) + CARD_WIDTH + FAMILY_GROUP_SPACING;
    });

    // Center the entire layout
    if (totalLayoutWidth > dimensions.width) {
      const centerShift = Math.max(50, (dimensions.width - totalLayoutWidth + FAMILY_GROUP_SPACING) / 2);
      nodeMap.forEach(node => {
        node.x += centerShift;
      });
    }

    return Array.from(nodeMap.values());
  }, [familyMembers, relationships, dimensions, relationshipMap]);

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
    const CARD_WIDTH = Math.min(200, dimensions.width * 0.15);
    const CARD_HEIGHT = Math.min(140, dimensions.height * 0.12);

    treeNodes.forEach((node) => {
      // Parent-child connections
      node.children.forEach((child) => {
        // Find if this child has siblings
        const childSiblings = child.siblings.filter(sibling => 
          node.children.some(nodeChild => nodeChild.member.id === sibling.member.id)
        );

        if (childSiblings.length > 0) {
          // Child has siblings - draw connection to midpoint above siblings
          const allSiblings = [child, ...childSiblings];
          const siblingCenterX = allSiblings.reduce((sum, s) => sum + s.x, 0) / allSiblings.length;
          const siblingY = child.y;
          const midpointY = node.y + CARD_HEIGHT/2 + (siblingY - node.y - CARD_HEIGHT/2) / 2;

          // Line from parent down to midpoint
          lines.push(
            <line
              key={`parent-mid-${node.member.id}-${child.member.id}`}
              x1={node.x}
              y1={node.y + CARD_HEIGHT/2}
              x2={node.x}
              y2={midpointY}
              className="connection-parent"
            />
          );

          

          // Line from midpoint to each child
          allSiblings.forEach((sibling) => {
            lines.push(
              <line
                key={`mid-child-${node.member.id}-${sibling.member.id}`}
                x1={sibling.x}
                y1={midpointY}
                x2={sibling.x}
                y2={sibling.y - CARD_HEIGHT/2}
                className="connection-parent"
                markerEnd="url(#arrowhead)"
              />
            );
          });
        } else {
          // Single child - direct connection
          lines.push(
            <line
              key={`parent-child-${node.member.id}-${child.member.id}`}
              x1={node.x}
              y1={node.y + CARD_HEIGHT/2}
              x2={child.x}
              y2={child.y - CARD_HEIGHT/2}
              className="connection-parent"
              markerEnd="url(#arrowhead)"
            />
          );
        }
      });

      // Spouse connections
      node.spouses.forEach((spouse) => {
        if (node.member.id < spouse.member.id) { // Prevent duplicate lines
          lines.push(
            <line
              key={`spouse-${node.member.id}-${spouse.member.id}`}
              x1={Math.min(node.x, spouse.x) + CARD_WIDTH/2}
              y1={node.y}
              x2={Math.max(node.x, spouse.x) - CARD_WIDTH/2}
              y2={spouse.y}
              className="connection-spouse"
            />
          );
        }
      });

      });

    // Sibling connections (new logic, processed once per group)
    const processedSiblingGroups = new Set<string>();
    treeNodes.forEach((node) => {
      if (node.siblings.length > 0) {
        // Collect all members of this sibling group, including the current node
        const siblingGroupMembers = new Set<TreeNode>();
        siblingGroupMembers.add(node);
        node.siblings.forEach(s => siblingGroupMembers.add(s));

        const allSiblings = Array.from(siblingGroupMembers).sort((a, b) => a.x - b.x);

        // Create a unique identifier for this sibling group based on sorted member IDs
        const groupIds = allSiblings.map(s => s.member.id).sort().join('-');
        if (processedSiblingGroups.has(groupIds)) {
          return; // This group has already been processed
        }
        processedSiblingGroups.add(groupIds);

        const siblingLineY = allSiblings[0].y + 5; // Vertical center of the cards, with a small offset

        for (let i = 0; i < allSiblings.length - 1; i++) {
          const currentSibling = allSiblings[i];
          const nextSibling = allSiblings[i + 1];

          // Draw horizontal line between adjacent siblings
          lines.push(
            <line
              key={`sibling-connect-${currentSibling.member.id}-${nextSibling.member.id}`}
              x1={currentSibling.x + CARD_WIDTH / 2} // Right side of current sibling
              y1={siblingLineY}
              x2={nextSibling.x - CARD_WIDTH / 2}   // Left side of next sibling
              y2={siblingLineY}
              className="connection-sibling"
            />
          );
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
              <rect
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                rx="16"
                fill={selectedMember?.id === node.member.id ? '#EEF2FF' : '#FFFFFF'}
                stroke={'#D1D5DB'}
                strokeWidth={'2'}
                className={`member-card-bg ${selectedMember?.id === node.member.id ? 'selected' : ''}`}
                style={{ pointerEvents: 'all' }}
              />
              
              <text
                x={CARD_WIDTH/2}
                y="32"
                textAnchor="middle"
                className="member-name-first"
                style={{ pointerEvents: 'none' }}
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