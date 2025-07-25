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
  onEditMember: (member: FamilyMember) => void;
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
  spouseOf?: TreeNode; // Track which blood relative this spouse belongs to
  isSpouse?: boolean; // Flag to identify spouses
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
  onAddExistingRelationship,
  onEditMember
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
  const VERTICAL_SPACING = 240; // Space between generations (increased)
  const SPOUSE_SPACING = 220; // Space between spouses
  const FAMILY_GROUP_SPACING = 350; // Space between disconnected family groups
  const MIN_CHILD_SPACING = 250; // (legacy, not used for child layout)
  const CHILD_GAP = 40; // New: gap between children to prevent overlap

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Attach wheel event as non-passive to prevent page scroll
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)));
    };
    svg.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      svg.removeEventListener('wheel', wheelHandler);
    };
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

    console.log('Family groups found:', familyGroups.map((group, idx) => ({
      groupIndex: idx,
      members: group.map(n => `${n.member.first_name} (parents: ${n.parents.map(p => p.member.first_name).join(',')})`)
    })));

    // --- RECURSIVE TREE LAYOUT WITH SIBLING GROUPING ---
    let totalLayoutWidth = 100;
    // Helper to get a unique key for a set of parents
    const getParentsKey = (node: TreeNode) => node.parents.map(p => p.member.id).sort().join('-');
    // Helper to group siblings by their parent set
    function groupSiblingsByParents(nodes: TreeNode[]): TreeNode[][] {
      const groups: { [key: string]: TreeNode[] } = {};
      nodes.forEach(node => {
        const key = getParentsKey(node) || '__root__';
        if (!groups[key]) groups[key] = [];
        groups[key].push(node);
      });
      return Object.values(groups);
    }
    
        // Helper to create family units (siblings + their spouses)
    function createFamilyUnits(nodes: TreeNode[]): TreeNode[][] {
      const familyUnits: TreeNode[][] = [];
      const processed = new Set<string>();
      
      nodes.forEach(node => {
        if (processed.has(node.member.id)) return;
        
        // Start a new family unit with this node
        const familyUnit: TreeNode[] = [node];
        processed.add(node.member.id);
        
        // Add all siblings of this node
        node.siblings.forEach(sibling => {
          if (!processed.has(sibling.member.id)) {
            familyUnit.push(sibling);
            processed.add(sibling.member.id);
          }
        });
        
        // Add all spouses of everyone in this family unit
        const spousesToAdd: TreeNode[] = [];
        familyUnit.forEach(member => {
          member.spouses.forEach(spouse => {
            if (!processed.has(spouse.member.id) && !familyUnit.some(m => m.member.id === spouse.member.id)) {
              console.log(`Checking spouse ${spouse.member.first_name} of ${member.member.first_name}`);
              
              // Check if this person has ANY blood relationships (parent/child/sibling) with ANYONE in the family unit
              const hasBloodRelationship = familyUnit.some(familyMember => {
                const hasParentChild = familyMember.children.some(child => child.member.id === spouse.member.id) ||
                  familyMember.parents.some(parent => parent.member.id === spouse.member.id) ||
                  spouse.children.some(child => child.member.id === familyMember.member.id) ||
                  spouse.parents.some(parent => parent.member.id === familyMember.member.id);
                
                const hasSibling = familyMember.siblings.some(sibling => sibling.member.id === spouse.member.id) ||
                  spouse.siblings.some(sibling => sibling.member.id === familyMember.member.id);
                
                if (hasParentChild || hasSibling) {
                  console.log(`${spouse.member.first_name} has blood relationship with ${familyMember.member.first_name}: parentChild=${hasParentChild}, sibling=${hasSibling}`);
                }
                
                return hasParentChild || hasSibling;
              });
              
              // Check if they share children (indicating they're spouses regardless of blood relationship)
              const hasSharedChildren = member.children.some(child => 
                spouse.children.some(spouseChild => spouseChild.member.id === child.member.id)
              );
              
              if (!hasBloodRelationship || hasSharedChildren) {
                // Mark as spouse if they have NO blood relationships OR if they share children
                spouse.isSpouse = true;
                spouse.spouseOf = member;
                spousesToAdd.push(spouse);
                processed.add(spouse.member.id);
                console.log(`${spouse.member.first_name} marked as spouse of ${member.member.first_name} (shared children: ${hasSharedChildren})`);
              } else {
                // This is a blood relative with no shared children - add them to the family unit as a blood relative
                console.log(`${spouse.member.first_name} is a blood relative, adding to family unit`);
                familyUnit.push(spouse);
                processed.add(spouse.member.id);
              }
            }
          });
        });
        familyUnit.push(...spousesToAdd);
        
        // Sort the family unit: prioritize spouses with shared children, then by family structure
        familyUnit.sort((a, b) => {
          // First, check if they share children (are spouses)
          const aChildren = a.children.map(c => c.member.id);
          const bChildren = b.children.map(c => c.member.id);
          const sharedChildren = aChildren.filter(id => bChildren.includes(id));
          
          if (sharedChildren.length > 0) {
            // They are spouses with shared children
            // Calculate individual subtree weights (excluding shared children)
            const calculateIndividualWeight = (node: TreeNode, sharedChildIds: string[]): number => {
              if (node.children.length === 0) return 0;
              
              let weight = 0;
              node.children.forEach(child => {
                if (!sharedChildIds.includes(child.member.id)) {
                  weight += 1; // Count individual children
                  weight += calculateIndividualWeight(child, sharedChildIds);
                }
              });
              return weight;
            };
            
            const aIndividualWeight = calculateIndividualWeight(a, sharedChildren);
            const bIndividualWeight = calculateIndividualWeight(b, sharedChildren);
            
            // Position the person with more individual children/descendants on the right
            if (aIndividualWeight !== bIndividualWeight) {
              return aIndividualWeight - bIndividualWeight; // More individual children on the right
            } else {
              // If equal individual weight, position by birth date (earlier on left)
              const aDate = a.member.birth_date || '1900-01-01';
              const bDate = b.member.birth_date || '1900-01-01';
              return aDate.localeCompare(bDate);
            }
          }
          
          // If they don't share children, check if they're siblings
          const aParents = a.parents.map(p => p.member.id).sort().join('-');
          const bParents = b.parents.map(p => p.member.id).sort().join('-');
          const aIsSibling = aParents === bParents && aParents !== '';
          const bIsSibling = aParents === bParents && aParents !== '';
          
          // If one is sibling and other is spouse, sibling comes first
          if (aIsSibling && !bIsSibling) return -1;
          if (!aIsSibling && bIsSibling) return 1;
          
          // If both are siblings, sort by family structure (children first, then birth date)
          if (aIsSibling && bIsSibling) {
            // Calculate the "weight" of each sibling based on their children and descendants
            const calculateSubtreeWeight = (node: TreeNode): number => {
              if (node.children.length === 0) return 0;
              
              let weight = node.children.length;
              node.children.forEach(child => {
                weight += calculateSubtreeWeight(child);
              });
              return weight;
            };
            
            const aWeight = calculateSubtreeWeight(a);
            const bWeight = calculateSubtreeWeight(b);
            
            // Position the person with more children/descendants on the right
            if (aWeight !== bWeight) {
              return aWeight - bWeight; // More children on the right
            }
            
            // If equal family size, sort by birth date (earlier on left)
            const aDate = a.member.birth_date || '1900-01-01';
            const bDate = b.member.birth_date || '1900-01-01';
            return aDate.localeCompare(bDate);
          }
          
          // If both are spouses, consider their children's positions
          if (!aIsSibling && !bIsSibling) {
            // Check if they have shared children
            const aChildren = a.children.map(c => c.member.id);
            const bChildren = b.children.map(c => c.member.id);
            const sharedChildren = aChildren.filter(id => bChildren.includes(id));
            
            if (sharedChildren.length > 0) {
              // They have shared children, so they're a couple
              // Position the person with earlier birth date on the left
              const aDate = a.member.birth_date || '1900-01-01';
              const bDate = b.member.birth_date || '1900-01-01';
              return aDate.localeCompare(bDate); // Earlier birth date on left
            }
          }
          
          // For any remaining cases, sort by birth date to ensure consistent ordering
          const aDate = a.member.birth_date || '1900-01-01';
          const bDate = b.member.birth_date || '1900-01-01';
          return aDate.localeCompare(bDate);
        });
        
        familyUnits.push(familyUnit);
      });
      
      // Debug: Log the family units to see what's happening
      console.log('Family units created:', familyUnits.map(unit => 
        unit.map(member => `${member.member.first_name} (isSpouse: ${member.isSpouse}, spouseOf: ${member.spouseOf?.member.first_name || 'none'}, children: ${member.children.map(c => c.member.first_name).join(',')})`)
      ));
      
      return familyUnits;
    }
    // Recursive layout for a sibling group
    const layoutSiblingGroup = (siblings: TreeNode[], depth: number, xOffset: number): { width: number, centers: number[] } => {
      // Separate blood relatives from spouses
      const bloodRelatives = siblings.filter(sib => !sib.isSpouse);
      const spouses = siblings.filter(sib => sib.isSpouse);
      
      // Sort blood relatives to minimize line crossings and accommodate spouses
      bloodRelatives.sort((a, b) => {
        // First priority: family members with spouses go to the left
        const aHasSpouse = a.spouses.length > 0;
        const bHasSpouse = b.spouses.length > 0;
        
        if (aHasSpouse && !bHasSpouse) return -1; // A has spouse, B doesn't - A goes left
        if (!aHasSpouse && bHasSpouse) return 1;  // B has spouse, A doesn't - B goes left
        
        // If both have spouses or both don't have spouses, use subtree width
        const calculateSubtreeWidth = (node: TreeNode): number => {
          if (node.children.length === 0) return CARD_WIDTH;
          
          // Group children by their parents to calculate width
          const childGroups = groupSiblingsByParents(node.children);
          let totalWidth = 0;
          
          childGroups.forEach((group, idx) => {
            // Estimate width for each child group
            totalWidth += group.length * CARD_WIDTH + (group.length - 1) * CHILD_GAP;
            if (idx < childGroups.length - 1) totalWidth += CHILD_GAP;
          });
          
          return Math.max(CARD_WIDTH, totalWidth);
        };
        
        const aWidth = calculateSubtreeWidth(a);
        const bWidth = calculateSubtreeWidth(b);
        
        // Position siblings with wider subtrees on the right to minimize line crossings
        if (aWidth !== bWidth) {
          return aWidth - bWidth; // Wider subtree on the right
        }
        
        // If subtree widths are equal, use birth date as tiebreaker
        const aDate = a.member.birth_date || '1900-01-01';
        const bDate = b.member.birth_date || '1900-01-01';
        return aDate.localeCompare(bDate);
      });
      
      let groupWidth = 0;
      const centers: number[] = [];
      let currentX = xOffset;
      
      // Calculate total width needed for all blood relatives first
      const bloodRelativeWidths: number[] = [];
      bloodRelatives.forEach((sib) => {
        const sibChildrenGroups = groupSiblingsByParents(sib.children);
        let sibSubtreeWidth = CARD_WIDTH;
        if (sibChildrenGroups.length > 0 && sib.children.length > 0) {
          let childrenBlockWidth = 0;
          sibChildrenGroups.forEach((childGroup, gidx) => {
            const { width: groupW } = layoutSiblingGroup(childGroup, depth + 1, 0); // Calculate width only
            childrenBlockWidth += groupW;
            if (gidx < sibChildrenGroups.length - 1) childrenBlockWidth += CHILD_GAP;
          });
          sibSubtreeWidth = Math.max(CARD_WIDTH, childrenBlockWidth);
        }
        bloodRelativeWidths.push(sibSubtreeWidth);
      });
      
      // Calculate total width needed
      const totalBloodRelativeWidth = bloodRelativeWidths.reduce((sum, width, idx) => {
        return sum + width + (idx < bloodRelativeWidths.length - 1 ? CHILD_GAP : 0);
      }, 0);
      
      // Add space for spouses on the left
      const spouseSpace = spouses.length * 100; // Space for spouses
      const totalWidth = totalBloodRelativeWidth + spouseSpace;
      
      // Start positioning from the left, accounting for spouse space
      currentX = xOffset + spouseSpace;
      
      // Layout blood relatives
      bloodRelatives.forEach((sib, idx) => {
        const sibChildrenGroups = groupSiblingsByParents(sib.children);
        let sibSubtreeWidth = CARD_WIDTH;
        let sibCenter = currentX + CARD_WIDTH / 2;
        
        if (sibChildrenGroups.length > 0 && sib.children.length > 0) {
          // Lay out all child sibling groups for this sibling
          let childrenBlockWidth = 0;
          sibChildrenGroups.forEach((childGroup, gidx) => {
            const { width: groupW } = layoutSiblingGroup(childGroup, depth + 1, currentX + childrenBlockWidth);
            childrenBlockWidth += groupW;
            if (gidx < sibChildrenGroups.length - 1) childrenBlockWidth += CHILD_GAP;
          });
          sibSubtreeWidth = Math.max(CARD_WIDTH, childrenBlockWidth);
          sibCenter = currentX + sibSubtreeWidth / 2;
        }
        
        // Position siblings to avoid line crossings based on their children's positions
        if (idx < bloodRelatives.length - 1) {
          const nextSib = bloodRelatives[idx + 1];
          
          // Check if either sibling has children that would cause line crossings
          const thisHasChildren = sib.children.length > 0;
          const nextHasChildren = nextSib.children.length > 0;
          
          if (thisHasChildren && nextHasChildren) {
            // Both have children, so give them more space to avoid line crossings
            const extraGap = CHILD_GAP * 2; // Double the gap to prevent crossings
            currentX += sibSubtreeWidth + extraGap;
          } else {
            currentX += sibSubtreeWidth + CHILD_GAP;
          }
        } else {
          currentX += sibSubtreeWidth;
        }
        
        sib.x = sibCenter;
        sib.y = depth * VERTICAL_SPACING + 100;
        centers.push(sibCenter);
      });
      
      // Position spouses to the left of their blood relatives, avoiding conflicts
      spouses.forEach((spouse, idx) => {
        if (spouse.spouseOf) {
          // Position spouse behind and to the left of their blood relative with proper spacing
          const spouseX = spouse.spouseOf.x - 150 - (idx * 30); // More space and stagger multiple spouses
          spouse.x = spouseX;
          spouse.y = spouse.spouseOf.y; // Same y position (behind)
        }
      });
      
      return { width: totalWidth, centers };
    };
    // Main layout for each family group
    familyGroups.forEach((group, groupIndex) => {
      // Find root nodes (oldest generation - those with no parents in this group)
      const groupSet = new Set(group.map(n => n.member.id));
      const roots = group.filter(n => 
        n.parents.filter(p => groupSet.has(p.member.id)).length === 0
      );
      
      console.log(`Family group ${groupIndex}: Found ${roots.length} root nodes:`, 
        roots.map(r => `${r.member.first_name} ${r.member.last_name}`));
      
      console.log(`Family group ${groupIndex}: All members and their parents:`, 
        group.map(n => `${n.member.first_name} -> parents: [${n.parents.map(p => p.member.first_name).join(', ')}]`));
      
      if (roots.length === 0 && group.length > 0) {
        // If no clear root, pick the person with the earliest birth date
        const sortedByAge = [...group].sort((a, b) => {
          const aDate = a.member.birth_date || '1900-01-01';
          const bDate = b.member.birth_date || '1900-01-01';
          return aDate.localeCompare(bDate);
        });
        roots.push(sortedByAge[0]);
        console.log(`Family group ${groupIndex}: No roots found, using oldest: ${sortedByAge[0].member.first_name}`);
      }
      
      // Create family units from the roots
      const familyUnits = createFamilyUnits(roots);
      let groupWidth = 0;
      familyUnits.forEach((familyUnit, idx) => {
        const { width } = layoutSiblingGroup(familyUnit, 0, totalLayoutWidth + groupWidth);
        groupWidth += width + FAMILY_GROUP_SPACING;
      });
      totalLayoutWidth += groupWidth;
    });
    // --- END RECURSIVE TREE LAYOUT WITH SIBLING GROUPING --

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
    
    // Get the bounding rect of the container
    const container = document.querySelector('.family-tree-container') as HTMLElement;
    const svgRect = svgRef.current?.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    if (!svgRect || !containerRect) return;

    const clientX = event.clientX;
    const clientY = event.clientY;
    const popupWidth = 380;
    const popupHeight = 600;
    const margin = 16;

    // Position relative to container
    let popupLeft = clientX - containerRect.left;
    let popupTop = clientY - containerRect.top;

    // Clamp so popup stays in view of the container
    if (popupLeft + popupWidth > containerRect.width - margin) {
      popupLeft = containerRect.width - popupWidth - margin;
    }
    if (popupLeft < margin) {
      popupLeft = margin;
    }
    if (popupTop + popupHeight > containerRect.height - margin) {
      popupTop = containerRect.height - popupHeight - margin;
    }
    if (popupTop < margin) {
      popupTop = margin;
    }

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
        // Use a consistent mid-point for cleaner routing
        const midY = parentY + (childY - parentY) / 2;
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
    const processedSiblingConnections = new Set<string>();
    treeNodes.forEach((node) => {
      if (node.siblings.length > 0) {
        // Create a complete sibling group including the current node
        const siblingGroup = [node, ...node.siblings];
        
        // Filter siblings in same generation and sort by x position
        const sameGenSiblings = siblingGroup
          .filter(s => s.generation === node.generation)
          .sort((a, b) => a.x - b.x);

        if (sameGenSiblings.length > 1) {
          const y = sameGenSiblings[0].y + 10; // Slightly below center
          
          for (let i = 0; i < sameGenSiblings.length - 1; i++) {
            const current = sameGenSiblings[i];
            const next = sameGenSiblings[i + 1];
            
            // Create a unique key for this connection that's the same regardless of order
            const connectionKey = [current.member.id, next.member.id].sort().join('-');
            
            if (!processedSiblingConnections.has(connectionKey)) {
              processedSiblingConnections.add(connectionKey);
              
              lines.push(
                <line
                  key={`sibling-${connectionKey}`}
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

          {/* Render spouses first (behind) */}
          {treeNodes.filter(node => node.isSpouse).map(node => (
            <g 
              key={node.member.id} 
              transform={`translate(${node.x - CARD_WIDTH/2}, ${node.y - CARD_HEIGHT/2})`}
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''} ${node.isSpouse ? 'spouse-card' : ''}`}
              onClick={(e) => handleMemberClick(node.member, e)}
              style={{ 
                cursor: 'pointer', 
                pointerEvents: 'all',
                zIndex: node.isSpouse ? '1' : '2'
              }}
            >
              {/* Card background with shadow */}
              <rect
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                rx="12"
                fill={selectedMember?.id === node.member.id ? '#EEF2FF' : '#FFFFFF'}
                stroke={(() => {
                  if (selectedMember?.id === node.member.id) {
                    return '#6366F1'; // Selected state takes priority
                  }
                  // Gender-based outline colors
                  switch (node.member.gender) {
                    case 'male':
                      return '#3B82F6'; // Blue for males
                    case 'female':
                      return '#EC4899'; // Pink for females
                    case 'other':
                      return '#10B981'; // Green for other
                    default:
                      return '#E5E7EB'; // Default gray
                  }
                })()}
                strokeWidth={selectedMember?.id === node.member.id ? '3' : '2'}
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
                x="30"
                y="25"
                textAnchor="start"
                className="member-name-first spouse-name"
                fill="#1F2937"
                fontSize="14"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.first_name}
              </text>
              <text
                x="30"
                y="42"
                textAnchor="start"
                className="member-name-last spouse-name"
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

              {/* Gender icon */}
              <text
                x={CARD_WIDTH - 20}
                y={CARD_HEIGHT - 15}
                textAnchor="middle"
                className="member-gender-icon"
                fill={(() => {
                  switch (node.member.gender) {
                    case 'male':
                      return '#3B82F6'; // Blue for males
                    case 'female':
                      return '#EC4899'; // Pink for females
                    case 'other':
                      return '#10B981'; // Green for other
                    default:
                      return '#9CA3AF'; // Default gray
                  }
                })()}
                fontSize="14"
                fontWeight="bold"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.gender === 'male' ? '♂' : node.member.gender === 'female' ? '♀' : '⚧'}
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

          {/* Render blood relatives last (on top) */}
          {treeNodes.filter(node => !node.isSpouse).map(node => (
            <g 
              key={node.member.id} 
              transform={`translate(${node.x - CARD_WIDTH/2}, ${node.y - CARD_HEIGHT/2})`}
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''}`}
              onClick={(e) => handleMemberClick(node.member, e)}
              style={{ 
                cursor: 'pointer', 
                pointerEvents: 'all'
              }}
            >
              {/* Card background with shadow */}
              <rect
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                rx="12"
                fill={selectedMember?.id === node.member.id ? '#EEF2FF' : '#FFFFFF'}
                stroke={(() => {
                  if (selectedMember?.id === node.member.id) {
                    return '#6366F1'; // Selected state takes priority
                  }
                  // Gender-based outline colors
                  switch (node.member.gender) {
                    case 'male':
                      return '#3B82F6'; // Blue for males
                    case 'female':
                      return '#EC4899'; // Pink for females
                    case 'other':
                      return '#10B981'; // Green for other
                    default:
                      return '#E5E7EB'; // Default gray
                  }
                })()}
                strokeWidth={selectedMember?.id === node.member.id ? '3' : '2'}
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

              {/* Gender icon */}
              <text
                x={CARD_WIDTH - 20}
                y={CARD_HEIGHT - 15}
                textAnchor="middle"
                className="member-gender-icon"
                fill={(() => {
                  switch (node.member.gender) {
                    case 'male':
                      return '#3B82F6'; // Blue for males
                    case 'female':
                      return '#EC4899'; // Pink for females
                    case 'other':
                      return '#10B981'; // Green for other
                    default:
                      return '#9CA3AF'; // Default gray
                  }
                })()}
                fontSize="14"
                fontWeight="bold"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.gender === 'male' ? '♂' : node.member.gender === 'female' ? '♀' : '⚧'}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 className="popup-title">
                {showMemberPopup.first_name} {showMemberPopup.last_name}
              </h3>
              <button
                onClick={() => {
                  closePopup();
                  onEditMember(showMemberPopup);
                }}
                style={{
                  background: '#10B981',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: 'white',
                  padding: '0',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold'
                }}
                title="Edit member"
              >
                ✎
              </button>
            </div>
            <button
              onClick={closePopup}
              className="popup-close"
            >
              ×
            </button>
          </div>

          {/* Member Information */}
          <div className="member-info-section">
            <h4 className="member-info-title">Member Information</h4>
            <div className="member-info-grid">
              <div className="member-info-item">
                <span className="member-info-label">Gender:</span>
                <span className="member-info-value">
                  <span 
                    style={{ 
                      color: (() => {
                        switch (showMemberPopup.gender) {
                          case 'male': return '#3B82F6';
                          case 'female': return '#EC4899';
                          case 'other': return '#10B981';
                          default: return '#9CA3AF';
                        }
                      })(),
                      fontWeight: 'bold',
                      fontSize: '16px'
                    }}
                  >
                    {showMemberPopup.gender === 'male' ? '♂ Male' : 
                     showMemberPopup.gender === 'female' ? '♀ Female' : 
                     showMemberPopup.gender === 'other' ? '⚧ Other' : 'Not specified'}
                  </span>
                </span>
              </div>
              {showMemberPopup.birth_date && (
                <div className="member-info-item">
                  <span className="member-info-label">Birth Date:</span>
                  <span className="member-info-value">
                    {new Date(showMemberPopup.birth_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              {showMemberPopup.death_date && (
                <div className="member-info-item">
                  <span className="member-info-label">Death Date:</span>
                  <span className="member-info-value">
                    {new Date(showMemberPopup.death_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              {showMemberPopup.notes && (
                <div className="member-info-item full-width">
                  <span className="member-info-label">Notes:</span>
                  <span className="member-info-value">
                    {showMemberPopup.notes}
                  </span>
                </div>
              )}
            </div>
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