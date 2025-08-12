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
  onClosePopup?: () => void; // Callback to close popup
  firstMember?: FamilyMember | null; // Track the first member created
  isPreview?: boolean; // New prop for preview mode
  externalPan?: { dx: number; dy: number } | null;
  externalZoom?: number | null;
  onFullscreen?: () => void; // Callback for fullscreen toggle
  onClose?: () => void; // Callback for closing the tree view
  isFullscreen?: boolean; //  prop for fullscreen mode
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
  onEditMember,
  onClosePopup,
  firstMember,
  externalPan,
  externalZoom,
  isPreview = false, // Default to false
  onFullscreen,
  onClose,
  isFullscreen = false, // prop for fullscreen mode
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showMemberPopup, setShowMemberPopup] = useState<FamilyMember | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const svgRef = useRef<SVGSVGElement>(null);
  const miniMapRef = useRef<SVGSVGElement>(null);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [miniMapDragging, setMiniMapDragging] = useState(false);

  // Layout constants
  const CARD_WIDTH = 180;
  const CARD_HEIGHT = 120;
  const HORIZONTAL_SPACING = 280; // Increased space between siblings
  const VERTICAL_SPACING = 240; // Space between generations
  const SPOUSE_SPACING = 220; // Space between spouses
  const FAMILY_GROUP_SPACING = 350; // Space between disconnected family groups
  const CHILD_GAP = 40; // gap between children to prevent overlap
  const ENHANCED_PARENT_SEPARATION = 600;
  const STEP_FAMILY_OFFSET = 1200;

  // Mini map constants
  const MINI_MAP_WIDTH = 200;
  const MINI_MAP_HEIGHT = 150;
  const MINI_MAP_CARD_WIDTH = 6;
  const MINI_MAP_CARD_HEIGHT = 4;

  // Handle external pan
  useEffect(() => {
    if (externalPan && (externalPan.dx !== 0 || externalPan.dy !== 0)) {
      setPan(prev => ({
        x: prev.x + externalPan.dx,
        y: prev.y + externalPan.dy,
      }));
    }
  }, [externalPan?.dx, externalPan?.dy]);

  // Handle external zoom
  useEffect(() => {
    if (typeof externalZoom === 'number') {
      applyZoomFactor(externalZoom);
    }
  }, [externalZoom]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Attach wheel event as non-passive to prevent page scroll
  useEffect(() => {
    if (isPreview) return; // Disable wheel in preview mode
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
  }, [isPreview]);

  const applyZoomFactor = (factor: number) => {
    setZoom(prev => Math.max(0.1, Math.min(3, prev * factor)));
  };

  // Enhanced generation assignment that handles both connected families and step families
  const assignGenerations = (allNodes: TreeNode[], referenceNode?: TreeNode) => {
    console.log('=== STARTING MULTI-GROUP GENERATION ASSIGNMENT ===');

    // Clear any existing generation assignments
    allNodes.forEach(node => {
      node.generation = 0; // Start everyone at generation 0
    });

    // Step 1: Identify all connected family groups (preserving original step family logic)
    const familyGroups: TreeNode[][] = [];
    const globalVisited = new Set<string>();

    allNodes.forEach((node) => {
      if (!globalVisited.has(node.member.id)) {
        const group: TreeNode[] = [];
        const queue = [node];
        globalVisited.add(node.member.id);

        // Use the same connection logic as the original code
        while (queue.length > 0) {
          const current = queue.shift()!;
          group.push(current);

          [...current.parents, ...current.children, ...current.spouses, ...current.siblings]
            .forEach((related) => {
              if (related && !globalVisited.has(related.member.id)) {
                globalVisited.add(related.member.id);
                queue.push(related);
              }
            });
        }
        familyGroups.push(group);
      }
    });

    console.log(`Found ${familyGroups.length} separate family groups:`,
      familyGroups.map((group, index) => ({
        groupIndex: index,
        members: group.map(n => n.member.first_name),
        size: group.length
      }))
    );

    // Step 2: Assign generations within each family group separately
    familyGroups.forEach((group, groupIndex) => {
      console.log(`\n=== Processing Family Group ${groupIndex} ===`);

      // Find the best starting node for this group
      let startNode: TreeNode | undefined;

      // If this group contains the reference node (first member), start there
      if (referenceNode) {
        startNode = group.find(n => n.member.id === referenceNode.member.id);
      }

      // If no reference node in this group, find a good starting point
      if (!startNode) {
        // Prefer nodes with no parents (root nodes)
        const rootNodes = group.filter(n => n.parents.length === 0);
        if (rootNodes.length > 0) {
          startNode = rootNodes[0];
        } else {
          // Fallback to oldest member in this group
          const sortedByAge = [...group].sort((a, b) => {
            const aDate = a.member.birth_date || '1900-01-01';
            const bDate = b.member.birth_date || '1900-01-01';
            return aDate.localeCompare(bDate);
          });
          startNode = sortedByAge[0];
        }
      }

      if (!startNode) {
        console.warn(`No starting node found for group ${groupIndex}`);
        return;
      }

      // Assign generations within this group using breadth-first search
      const visited = new Set<string>();
      const generationQueue: Array<{ node: TreeNode, generation: number }> = [];

      startNode.generation = 0; // This group starts at generation 0
      generationQueue.push({ node: startNode, generation: 0 });
      visited.add(startNode.member.id);

      console.log(`Starting group ${groupIndex} generation assignment from ${startNode.member.first_name}`);

      while (generationQueue.length > 0) {
        const { node, generation } = generationQueue.shift()!;

        // Process all family connections within this group
        const processRelatedNode = (related: TreeNode, targetGeneration: number, relationship: string) => {
          if (!group.some(n => n.member.id === related.member.id)) {
            // Skip nodes that aren't in this family group
            return;
          }

          if (!visited.has(related.member.id)) {
            related.generation = targetGeneration;
            generationQueue.push({ node: related, generation: targetGeneration });
            visited.add(related.member.id);
            console.log(`  Assigned ${related.member.first_name} to generation ${targetGeneration} (${relationship} of ${node.member.first_name})`);
          } else if (related.generation !== targetGeneration) {
            // Handle generation conflicts by prioritizing sibling relationships
            if (relationship === 'sibling' || relationship === 'spouse') {
              console.warn(`  Generation conflict resolved: ${related.member.first_name} moved from generation ${related.generation} to ${targetGeneration} (${relationship} relationship takes precedence)`);
              related.generation = targetGeneration;
            }
          }
        };

        // CRITICAL: Siblings must be in the same generation (this fixes Bryan/Terry)
        node.siblings.forEach(sibling => {
          processRelatedNode(sibling, generation, 'sibling');
        });

        // Spouses must be in the same generation
        node.spouses.forEach(spouse => {
          processRelatedNode(spouse, generation, 'spouse');
        });

        // Children go down one generation
        node.children.forEach(child => {
          processRelatedNode(child, generation + 1, 'child');
        });

        // Parents go up one generation
        node.parents.forEach(parent => {
          processRelatedNode(parent, generation - 1, 'parent');
        });
      }

      console.log(`Group ${groupIndex} generation assignments:`,
        group.map(n => `${n.member.first_name}: gen ${n.generation}`)
      );
    });

    // Step 3: Debug output for final generation assignments
    console.log('\n=== FINAL GENERATION ASSIGNMENTS BY GROUP ===');
    familyGroups.forEach((group, groupIndex) => {
      console.log(`Group ${groupIndex}:`, group.map(n => `${n.member.first_name}(gen ${n.generation})`));
    });

    console.log('=== MULTI-GROUP GENERATION ASSIGNMENT COMPLETE ===');

    // Return the family groups for later use in step family positioning
    return familyGroups;
  };

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

    // GLOBAL COUPLE UNIT CREATION - This makes couple information available to all functions
    const coupleUnits = new Map<string, string>(); // Maps each person to their spouse's ID
    const bloodRelativeSet = new Set<string>(); // Track confirmed blood relatives
    const processedCouples = new Set<string>(); // Prevents duplicate processing

    // First, identify clear blood relatives across the entire family tree
    Array.from(nodeMap.values()).forEach(node => {
      const hasParents = node.parents.length > 0;
      const hasChildren = node.children.length > 0;
      const hasSiblings = node.siblings.length > 0;

      if (hasParents || hasChildren || hasSiblings) {
        bloodRelativeSet.add(node.member.id);
        console.log(`Enhanced: Identified ${node.member.first_name} as blood relative`);
      }
    });

    // Second pass - ensure all siblings of blood relatives are also marked as blood relatives
    Array.from(nodeMap.values()).forEach(node => {
      if (bloodRelativeSet.has(node.member.id)) {
        // Mark all siblings as blood relatives too
        node.siblings.forEach(sibling => {
          bloodRelativeSet.add(sibling.member.id);
          console.log(`Enhanced: Added sibling ${sibling.member.first_name} as blood relative`);
        });
      }
    });

    // Create couple units that respect sibling relationships
    Array.from(nodeMap.values()).forEach(node => {
      node.spouses.forEach(spouse => {
        // Create a unique couple identifier to prevent duplicate processing
        const coupleKey = [node.member.id, spouse.member.id].sort().join('-');
        if (processedCouples.has(coupleKey)) return;
        processedCouples.add(coupleKey);

        const nodeIsBlood = bloodRelativeSet.has(node.member.id);
        const spouseIsBlood = bloodRelativeSet.has(spouse.member.id);

        // Don't create spouse units between siblings
        const areSiblings = node.siblings.some(sib => sib.member.id === spouse.member.id) ||
          spouse.siblings.some(sib => sib.member.id === node.member.id);

        if (areSiblings) {
          console.log(`PREVENTED: ${node.member.first_name} and ${spouse.member.first_name} are siblings, not spouses`);
          return; // Skip creating a couple unit for siblings
        }

        // Only create couple units for actual spouses (not siblings)
        if (nodeIsBlood || spouseIsBlood) {
          // Both become "family unit members" regardless of blood status
          bloodRelativeSet.add(node.member.id);
          bloodRelativeSet.add(spouse.member.id);

          // Establish the couple bond
          coupleUnits.set(node.member.id, spouse.member.id);
          coupleUnits.set(spouse.member.id, node.member.id);

          // Determine which one is the "anchor" (blood relative) and which is "spouse"
          if (nodeIsBlood && !spouseIsBlood) {
            spouse.isSpouse = true;
            spouse.spouseOf = node;
            console.log(`Enhanced: Created couple unit ${node.member.first_name} (anchor) + ${spouse.member.first_name} (spouse)`);
          } else if (!nodeIsBlood && spouseIsBlood) {
            node.isSpouse = true;
            node.spouseOf = spouse;
            console.log(`Enhanced: Created couple unit ${spouse.member.first_name} (anchor) + ${node.member.first_name} (spouse)`);
          } else {
            // Both are blood relatives but NOT siblings: they can be a couple
            if (node.generation <= spouse.generation) {
              spouse.isSpouse = true;
              spouse.spouseOf = node;
              console.log(`Enhanced: Created couple unit ${node.member.first_name} (primary) + ${spouse.member.first_name} (partner)`);
            } else {
              node.isSpouse = true;
              node.spouseOf = spouse;
              console.log(`Enhanced: Created couple unit ${spouse.member.first_name} (primary) + ${node.member.first_name} (partner)`);
            }
          }
        }
      });
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

    // --- STRUCTURE TREE LAYOUT ---
    let totalLayoutWidth = 100; // Start with some initial padding

    // Helper to get a unique key for a set of parents
    const getParentsKey = (node: TreeNode) => node.parents.map(p => p.member.id).sort().join('-');

    // Helper to group siblings by their parent set
    function groupSiblingsByParents(nodes: TreeNode[]): TreeNode[][] {
      const groups: { [key: string]: TreeNode[] } = {};

      nodes.forEach(node => {
        // Group by parent IDs AND generation to ensure proper sibling grouping
        const parentIds = node.parents.map(p => p.member.id).sort().join('-');
        const key = `${parentIds}-gen${node.generation}`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(node);
      });

      // If a node has siblings explicitly defined, ensure they're grouped together
      nodes.forEach(node => {
        node.siblings.forEach(sibling => {
          // Find which groups these siblings are in
          const nodeGroup = Object.entries(groups).find(([_, members]) =>
            members.some(m => m.member.id === node.member.id)
          );
          const siblingGroup = Object.entries(groups).find(([_, members]) =>
            members.some(m => m.member.id === sibling.member.id)
          );

          // If they're in different groups but should be siblings, merge the groups
          if (nodeGroup && siblingGroup && nodeGroup[0] !== siblingGroup[0]) {
            // Merge sibling group into node group
            nodeGroup[1].push(...siblingGroup[1]);
            delete groups[siblingGroup[0]];
          }
        });
      });

      // Debug logging
      console.log('Improved sibling groups by parents:', Object.entries(groups).map(([key, nodes]) => ({
        parentKey: key,
        siblings: nodes.map(n => `${n.member.first_name} (gen: ${n.generation})`)
      })));

      return Object.values(groups);
    }

    // Helper to create family units (siblings + their spouses)
    function createFamilyUnitsImproved(nodes: TreeNode[]): TreeNode[][] {
      const familyUnits: TreeNode[][] = [];
      const processed = new Set<string>();

      console.log('=== SIBLING-PRIORITY FAMILY UNIT CREATION ===');

      // Enhanced blood relative detection that uses the global bloodRelativeSet
      const isBloodRelative = (node: TreeNode, withinNodes: TreeNode[]): boolean => {
        // If explicitly marked as spouse, they're not a blood relative in this context
        if (node.isSpouse) return false;

        // If explicitly identified as blood relative globally, they are one
        if (bloodRelativeSet.has(node.member.id)) return true;

        // Check family connections within this specific node group
        const hasChildrenInGroup = node.children.some(child =>
          withinNodes.some(n => n.member.id === child.member.id)
        );

        const hasParentsInGroup = node.parents.some(parent =>
          withinNodes.some(n => n.member.id === parent.member.id)
        );

        const hasSiblingsInGroup = node.siblings.some(sibling =>
          withinNodes.some(n => n.member.id === sibling.member.id)
        );

        return hasChildrenInGroup || hasParentsInGroup || hasSiblingsInGroup;
      };

      // Sort nodes to prioritize blood relatives and their sibling groups
      const sortedNodes = [...nodes].sort((a, b) => {
        const aIsBlood = isBloodRelative(a, nodes);
        const bIsBlood = isBloodRelative(b, nodes);

        // Blood relatives first
        if (aIsBlood && !bIsBlood) return -1;
        if (!aIsBlood && bIsBlood) return 1;

        // Among blood relatives, those with more sibling connections first
        if (aIsBlood && bIsBlood) {
          const aSiblingCount = a.siblings.length;
          const bSiblingCount = b.siblings.length;
          if (aSiblingCount !== bSiblingCount) return bSiblingCount - aSiblingCount;

          // If sibling counts are equal, use relationship count
          const aScore = a.parents.length + a.children.length;
          const bScore = b.parents.length + b.children.length;
          return bScore - aScore;
        }

        // Among non-blood relatives, those with children first
        return b.children.length - a.children.length;
      });

      sortedNodes.forEach(node => {
        if (processed.has(node.member.id)) return;

        // Start new family unit
        const familyUnit: TreeNode[] = [];

        // PRIORITY 1: Add the node and all their siblings first (keeping siblings together)
        const getAllSiblings = (centerNode: TreeNode): TreeNode[] => {
          const siblings = new Set<TreeNode>();
          siblings.add(centerNode);

          centerNode.siblings.forEach(sib => siblings.add(sib));

          // Also check for same-parent siblings to ensure we don't miss any
          const nodeParentIds = centerNode.parents.map(p => p.member.id).sort().join('-');
          if (nodeParentIds) {
            nodes.forEach(otherNode => {
              if (otherNode.member.id !== centerNode.member.id) {
                const otherParentIds = otherNode.parents.map(p => p.member.id).sort().join('-');
                if (otherParentIds === nodeParentIds) {
                  siblings.add(otherNode);
                }
              }
            });
          }

          return Array.from(siblings);
        };

        const allSiblings = getAllSiblings(node);
        const unprocessedSiblings = allSiblings.filter(sib => !processed.has(sib.member.id));

        // Add all unprocessed siblings to the family unit
        unprocessedSiblings.forEach(sibling => {
          familyUnit.push(sibling);
          processed.add(sibling.member.id);
          console.log(`Added sibling ${sibling.member.first_name} to family unit`);
        });

        // PRIORITY 2: After siblings are grouped, add their spouses
        unprocessedSiblings.forEach(sibling => {
          const spouseId = coupleUnits.get(sibling.member.id);
          const spouse = spouseId ? nodes.find(n => n.member.id === spouseId) : null;

          if (spouse && !processed.has(spouse.member.id)) {
            familyUnit.push(spouse);
            processed.add(spouse.member.id);
            console.log(`Added ${sibling.member.first_name}'s spouse ${spouse.member.first_name} to family unit`);
          }
        });

        if (familyUnit.length > 0) {
          // Sort family unit to keep siblings together and place spouses adjacent to their partners
          familyUnit.sort((a, b) => {
            const aIsSpouse = a.isSpouse;
            const bIsSpouse = b.isSpouse;

            // Blood relatives (siblings) come first, then their spouses
            if (!aIsSpouse && bIsSpouse) return -1;
            if (aIsSpouse && !bIsSpouse) return 1;

            // Among blood relatives, sort by birth date to maintain natural sibling order
            if (!aIsSpouse && !bIsSpouse) {
              const aDate = a.member.birth_date || '1900-01-01';
              const bDate = b.member.birth_date || '1900-01-01';
              return aDate.localeCompare(bDate);
            }

            // Among spouses, maintain relative positioning
            return 0;
          });

          familyUnits.push(familyUnit);
          console.log(`Created sibling-priority family unit:`, familyUnit.map(m =>
            `${m.member.first_name}${m.isSpouse ? ' (spouse)' : ''}`
          ));
        }
      });

      console.log('=== SIBLING-PRIORITY FAMILY UNIT CREATION COMPLETE ===');
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

      // Calculate total spacing needed between siblings based on their children
      let totalSpacingNeeded = 0;
      for (let i = 0; i < bloodRelatives.length - 1; i++) {
        const thisSib = bloodRelatives[i];
        const nextSib = bloodRelatives[i + 1];

        const thisChildCount = thisSib.children.length;
        const nextChildCount = nextSib.children.length;
        const totalChildCount = thisChildCount + nextChildCount;

        // Base gap increases with more children to prevent line crossings
        let spacingGap = CHILD_GAP;

        if (totalChildCount > 0) {
          // Increase spacing based on total number of children between siblings
          spacingGap = CHILD_GAP + (totalChildCount * 20); // 20px extra per child

          // Additional spacing if both siblings have children
          if (thisChildCount > 0 && nextChildCount > 0) {
            spacingGap += CHILD_GAP * 1.5; // Extra 50% gap when both have children
          }

          // Even more spacing if either sibling has many children
          if (thisChildCount >= 3 || nextChildCount >= 3) {
            spacingGap += CHILD_GAP * 2; // Extra spacing for families with 3+ children
          }
        }

        // Account for spouses of siblings in spacing calculation
        const thisHasSpouse = thisSib.spouses.length > 0;
        const nextHasSpouse = nextSib.spouses.length > 0;

        if (thisHasSpouse || nextHasSpouse) {
          spacingGap += SPOUSE_SPACING / 2; // Add extra space when spouses are involved
        }

        totalSpacingNeeded += spacingGap;
      }

      // Calculate total width including spouses
      const totalBloodRelativeWidth = bloodRelativeWidths.reduce((sum, width) => sum + width, 0) + totalSpacingNeeded;

      // MIGHT CHANGE LATER: Don't add arbitrary spouse space: spouses position relative to their blood relatives
      const totalWidth = totalBloodRelativeWidth;

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

        // Position siblings with calculated spacing
        if (idx < bloodRelatives.length - 1) {
          const nextSib = bloodRelatives[idx + 1];

          // Calculate spacing based on number of children each sibling has
          const thisChildCount = sib.children.length;
          const nextChildCount = nextSib.children.length;
          const totalChildCount = thisChildCount + nextChildCount;

          // Base gap increases with more children to prevent line crossings
          let spacingGap = CHILD_GAP;

          if (totalChildCount > 0) {
            // Increase spacing based on total number of children between siblings
            spacingGap = CHILD_GAP + (totalChildCount * 20); // 20px extra per child

            // Additional spacing if both siblings have children
            if (thisChildCount > 0 && nextChildCount > 0) {
              spacingGap += CHILD_GAP * 1.5; // Extra 50% gap when both have children
            }

            // Even more spacing if either sibling has many children
            if (thisChildCount >= 3 || nextChildCount >= 3) {
              spacingGap += CHILD_GAP * 2; // Extra spacing for families with 3+ children
            }
          }

          // Account for spouses in spacing
          const thisHasSpouse = sib.spouses.length > 0;
          const nextHasSpouse = nextSib.spouses.length > 0;

          if (thisHasSpouse || nextHasSpouse) {
            spacingGap += SPOUSE_SPACING / 2; // Add extra space when spouses are involved
          }

          currentX += sibSubtreeWidth + spacingGap;
        } else {
          currentX += sibSubtreeWidth;
        }

        sib.x = sibCenter;

        // This prevents spatial concerns from overriding family relationships
        sib.y = sib.generation * VERTICAL_SPACING + 100;
        console.log(`Positioned ${sib.member.first_name} at generation ${sib.generation} (Y: ${sib.y})`);
        centers.push(sibCenter);
      });

      // Position spouses next to their blood relatives
      spouses.forEach((spouse) => {
        if (spouse.spouseOf) {
          // Position spouse immediately adjacent to their blood relative
          const spouseX = spouse.spouseOf.x - (CARD_WIDTH / 2) - (SPOUSE_SPACING / 3); // Much closer than other cards
          spouse.x = spouseX;
          // Ensure spouses are also positioned at their correct generation
          spouse.y = spouse.generation * VERTICAL_SPACING + 100;
          console.log(`Positioned spouse ${spouse.member.first_name} at generation ${spouse.generation} (Y: ${spouse.y})`);

          console.log(`Positioned spouse ${spouse.member.first_name} next to ${spouse.spouseOf.member.first_name} at (${Math.round(spouseX)}, ${Math.round(spouse.y)})`);
        }
      });

      return { width: totalWidth, centers };
    };

    // Assign generations FIRST before any layout positioning:
    // This ensures family relationships take precedence over spatial concerns
    const firstMemberNode = firstMember ? Array.from(nodeMap.values()).find(n => n.member.id === firstMember.id) : undefined;
    const familyGroupsFromGeneration = assignGenerations(Array.from(nodeMap.values()), firstMemberNode);

    console.log('=== GENERATION ASSIGNMENT COMPLETE - STARTING LAYOUT ===');

    // Main layout for each family group
    familyGroups.forEach((group, groupIndex) => {
      const groupSet = new Set(group.map(n => n.member.id));

      // Find nodes with no parents in this group (potential roots)
      const nodesWithNoParents = group.filter(n =>
        n.parents.filter(p => groupSet.has(p.member.id)).length === 0
      );

      // Find nodes with the most descendants
      const calculateDescendantCount = (node: TreeNode): number => {
        let count = node.children.length;
        node.children.forEach(child => {
          count += calculateDescendantCount(child);
        });
        return count;
      };

      const nodesWithDescendants = group.map(node => ({
        node,
        descendantCount: calculateDescendantCount(node)
      })).sort((a, b) => b.descendantCount - a.descendantCount);

      // Determine the best root nodes to preserve structure
      let roots: TreeNode[] = [];

      let parentsToPositionAbove: TreeNode[] = [];
      let actualRoots: TreeNode[] = [];

      // Step 1: Identify parents that should be positioned above their children
      nodesWithNoParents.forEach(node => {
        const shouldBeAbove = (
          node.children.length >= 2 &&                    // Has multiple children
          node.siblings.length === 0 &&                   // No siblings  
          node.spouses.length === 0 &&                    // No spouses
          node.children.every(child =>                    // All children have siblings (form a sibling group)
            child.siblings.length > 0 ||
            node.children.length > 1  // OR this parent has multiple children (making them siblings)
          )
        );

        if (shouldBeAbove) {
          parentsToPositionAbove.push(node);
          console.log(`${node.member.first_name} will be positioned above children:`,
            node.children.map(c => c.member.first_name).join(', '));
        } else {
          actualRoots.push(node);
          console.log(`${node.member.first_name} will be included in main layout`);
        }
      });

      // Step 2: If we removed parents to position above, use their children as roots instead
      if (parentsToPositionAbove.length > 0) {
        const childrenOfAboveParents = new Set<TreeNode>();

        parentsToPositionAbove.forEach(parent => {
          parent.children.forEach(child => {
            if (groupSet.has(child.member.id)) {
              childrenOfAboveParents.add(child);
            }
          });
        });

        // Add these children to our actual roots
        childrenOfAboveParents.forEach(child => {
          if (!actualRoots.includes(child)) {
            actualRoots.push(child);
          }
        });
      }

      // Step 3: Determine final roots for layout
      if (actualRoots.length > 0) {
        roots = actualRoots;
        console.log(`Family group ${groupIndex}: Using actual roots:`,
          roots.map(r => `${r.member.first_name} ${r.member.last_name}`));
      } else if (nodesWithDescendants.length > 0) {
        // Fallback to descendant count
        roots = [nodesWithDescendants[0].node];
        console.log(`Family group ${groupIndex}: Using descendant count fallback:`,
          `${roots[0].member.first_name} ${roots[0].member.last_name}`);
      } else {
        // Final fallback
        const sortedByAge = [...group].sort((a, b) => {
          const aDate = a.member.birth_date || '1900-01-01';
          const bDate = b.member.birth_date || '1900-01-01';
          return aDate.localeCompare(bDate);
        });
        roots = [sortedByAge[0]];
        console.log(`Family group ${groupIndex}: Using oldest member as root:`,
          `${roots[0].member.first_name} ${roots[0].member.last_name}`);
      }

      console.log(`Family group ${groupIndex}: All members and their parents:`,
        group.map(n => `${n.member.first_name} -> parents: [${n.parents.map(p => p.member.first_name).join(', ')}]`));

      // Create family units from the roots
      const familyUnits = createFamilyUnitsImproved(roots);
      let groupWidth = 0;
      familyUnits.forEach((familyUnit, idx) => {
        const { width } = layoutSiblingGroup(familyUnit, 0, totalLayoutWidth + groupWidth);
        groupWidth += width + FAMILY_GROUP_SPACING;
      });

      // Step 4: Position the identified parents above their children
      const allLayoutedNodes = new Set<string>();

      // Collect all nodes that were positioned by the layout
      const collectLayoutedNodes = (node: TreeNode) => {
        allLayoutedNodes.add(node.member.id);
        node.children.forEach(child => collectLayoutedNodes(child));
        node.spouses.forEach(spouse => allLayoutedNodes.add(spouse.member.id));
      };

      familyUnits.forEach(unit => {
        unit.forEach(member => collectLayoutedNodes(member));
      });

      // Position the pre-identified parents above their children
      parentsToPositionAbove.forEach(parent => {
        const childrenInLayout = parent.children.filter(child => allLayoutedNodes.has(child.member.id));

        if (childrenInLayout.length > 0) {
          // Calculate average X position of all children
          const avgX = childrenInLayout.reduce((sum, child) => sum + child.x, 0) / childrenInLayout.length;
          const minChildY = Math.min(...childrenInLayout.map(child => child.y));

          // Position parent above children
          parent.x = avgX;
          parent.y = minChildY - VERTICAL_SPACING;

          // Mark parent as positioned
          allLayoutedNodes.add(parent.member.id);

          console.log(`Positioned parent ${parent.member.first_name} at (${Math.round(parent.x)}, ${Math.round(parent.y)}) above children:`,
            childrenInLayout.map(c => c.member.first_name).join(', '));
        }
      });

      // Handle any remaining unpositioned nodes
      group.forEach(node => {
        if (!allLayoutedNodes.has(node.member.id)) {
          const childrenInLayout = node.children.filter(child => allLayoutedNodes.has(child.member.id));

          if (childrenInLayout.length > 0) {
            // Position above children
            const avgX = childrenInLayout.reduce((sum, child) => sum + child.x, 0) / childrenInLayout.length;
            const minChildY = Math.min(...childrenInLayout.map(child => child.y));

            node.x = avgX;
            node.y = minChildY - VERTICAL_SPACING;

            console.log(`Positioned remaining parent ${node.member.first_name} above children`);
          } else {
            // Position separately
            node.x = totalLayoutWidth + groupWidth + 200;
            node.y = 100;
            console.log(`Positioned orphaned node ${node.member.first_name} separately`);
          }
        }
      });

      totalLayoutWidth += groupWidth;
    });
    // --- STRUCTURE TREE LAYOUT --

    const getConnectedFamily = (startNode: TreeNode, visited = new Set<string>()): TreeNode[] => {
      if (visited.has(startNode.member.id)) return [];
      visited.add(startNode.member.id);

      const family = [startNode];

      // Add parents, children, siblings, and spouses
      [...startNode.parents, ...startNode.children, ...startNode.siblings, ...startNode.spouses].forEach(related => {
        if (related && !visited.has(related.member.id)) {
          family.push(...getConnectedFamily(related, visited));
        }
      });

      return family;
    };

    if (firstMember) {
      const rootNode = Array.from(nodeMap.values()).find(n => n.member.id === firstMember.id);

      if (rootNode && rootNode.parents.length >= 2) {
        const [parent1, parent2] = rootNode.parents;

        // Determine maternal (left) and paternal (right) parents
        let maternalParent = parent1;
        let paternalParent = parent2;

        // Use gender, birth date, or alphabetical order to determine sides
        if (parent1.member.gender === 'female' && parent2.member.gender === 'male') {
          maternalParent = parent1;
          paternalParent = parent2;
        } else if (parent1.member.gender === 'male' && parent2.member.gender === 'female') {
          maternalParent = parent2;
          paternalParent = parent1;
        } else if (parent1.member.birth_date && parent2.member.birth_date) {
          // Older parent goes to left (maternal side)
          if (parent1.member.birth_date < parent2.member.birth_date) {
            maternalParent = parent1;
            paternalParent = parent2;
          } else {
            maternalParent = parent2;
            paternalParent = parent1;
          }
        } else if (parent1.member.first_name.toLowerCase() < parent2.member.first_name.toLowerCase()) {
          maternalParent = parent1;
          paternalParent = parent2;
        }

        console.log(`Family side assignment: ${maternalParent.member.first_name} (maternal/left), ${paternalParent.member.first_name} (paternal/right)`);

        // Calculate desired positions
        const rootX = rootNode.x;
        const desiredMaternalX = rootX - ENHANCED_PARENT_SEPARATION;
        const desiredPaternalX = rootX + ENHANCED_PARENT_SEPARATION;

        // Function to collect family tree while respecting parent-child relationships
        const collectFamilyLineage = (startNode: TreeNode, visited = new Set(), excludeSharedDescendants = false) => {
          if (visited.has(startNode.member.id)) return [];
          visited.add(startNode.member.id);

          const lineage = [startNode];

          // Add parents and their ancestors (going up)
          startNode.parents.forEach(parent => {
            if (!visited.has(parent.member.id)) {
              lineage.push(...collectFamilyLineage(parent, visited, excludeSharedDescendants));
            }
          });

          // Add siblings (same generation)
          startNode.siblings.forEach(sibling => {
            if (!visited.has(sibling.member.id)) {
              lineage.push(...collectFamilyLineage(sibling, visited, excludeSharedDescendants));
            }
          });

          // Add children and descendants (going down) - but be careful about shared children
          startNode.children.forEach(child => {
            if (!visited.has(child.member.id)) {
              // Check if this child belongs to BOTH parents (shared child)
              const childParentIds = child.parents.map(p => p.member.id);
              const isSharedChild = childParentIds.includes(maternalParent.member.id) &&
                childParentIds.includes(paternalParent.member.id);

              if (excludeSharedDescendants && isSharedChild) {
                // Skip shared children when collecting individual lineages
                return;
              }

              if (!excludeSharedDescendants || !isSharedChild) {
                lineage.push(...collectFamilyLineage(child, visited, excludeSharedDescendants));
              }
            }
          });

          return lineage;
        };

        // Collect each parent's lineage (excluding shared descendants)
        const maternalLineage = collectFamilyLineage(maternalParent, new Set(), true);
        const paternalLineage = collectFamilyLineage(paternalParent, new Set(), true);

        // Identify all descendants of the root node (children, grandchildren, etc.)
        const getAllDescendants = (node: TreeNode, visited = new Set()) => {
          if (visited.has(node.member.id)) return [];
          visited.add(node.member.id);

          let descendants: TreeNode[] = [];
          node.children.forEach(child => {
            descendants.push(child);
            descendants.push(...getAllDescendants(child, visited));
          });
          return descendants;
        };

        const allRootDescendants = getAllDescendants(rootNode);

        // Separate descendants by their parentage
        const maternalOnlyDescendants: TreeNode[] = [];
        const paternalOnlyDescendants: TreeNode[] = [];
        const sharedDescendants: TreeNode[] = []; // Children of BOTH parents

        allRootDescendants.forEach(descendant => {
          const parentIds = descendant.parents.map(p => p.member.id);
          const hasMaternalParent = parentIds.includes(maternalParent.member.id);
          const hasPaternalParent = parentIds.includes(paternalParent.member.id);

          if (hasMaternalParent && hasPaternalParent) {
            sharedDescendants.push(descendant);
          } else if (hasMaternalParent) {
            maternalOnlyDescendants.push(descendant);
          } else if (hasPaternalParent) {
            paternalOnlyDescendants.push(descendant);
          } else {
            // This descendant doesn't have either core parent, keep them with their actual parent
            // Find which lineage their actual parents belong to
            let belongsToMaternal = false;
            let belongsToPaternal = false;

            descendant.parents.forEach(actualParent => {
              if (maternalLineage.some(m => m.member.id === actualParent.member.id)) {
                belongsToMaternal = true;
              }
              if (paternalLineage.some(p => p.member.id === actualParent.member.id)) {
                belongsToPaternal = true;
              }
            });

            if (belongsToMaternal && !belongsToPaternal) {
              maternalOnlyDescendants.push(descendant);
            } else if (belongsToPaternal && !belongsToMaternal) {
              paternalOnlyDescendants.push(descendant);
            } else {
              // If unclear, keep them in shared
              sharedDescendants.push(descendant);
            }
          }
        });

        console.log('Maternal lineage:', maternalLineage.map(n => n.member.first_name));
        console.log('Paternal lineage:', paternalLineage.map(n => n.member.first_name));
        console.log('Maternal-only descendants:', maternalOnlyDescendants.map(n => n.member.first_name));
        console.log('Paternal-only descendants:', paternalOnlyDescendants.map(n => n.member.first_name));
        console.log('Shared descendants:', sharedDescendants.map(n => n.member.first_name));

        // Calculate offsets
        const maternalOffset = desiredMaternalX - maternalParent.x;
        const paternalOffset = desiredPaternalX - paternalParent.x;

        // Function to move a person and automatically move their spouse with them
        const moveCoupleUnit = (person: TreeNode, offsetX: number, offsetY: number = 0, logContext: string) => {
          // Move the person
          person.x += offsetX;
          person.y += offsetY;

          // Check if they have a spouse that needs to move with them using global couple data
          const spouseId = coupleUnits.get(person.member.id);
          const spouse = spouseId ? Array.from(nodeMap.values()).find(n => n.member.id === spouseId) : null;

          if (spouse) {
            // Move the spouse to maintain their relative position
            spouse.x += offsetX;
            spouse.y += offsetY;
            console.log(`${logContext}: Moved couple unit ${person.member.first_name} + ${spouse.member.first_name}`);
          } else {
            console.log(`${logContext}: Moved individual ${person.member.first_name}`);
          }
        };

        // Move maternal lineage and their descendants AS COUPLE UNITS
        [...maternalLineage, ...maternalOnlyDescendants].forEach(node => {
          if (node.member.id !== rootNode.member.id) { // Don't move the root
            moveCoupleUnit(node, maternalOffset, 0, "Maternal side");
          }
        });

        // Move paternal lineage and their descendants AS COUPLE UNITS  
        [...paternalLineage, ...paternalOnlyDescendants].forEach(node => {
          if (node.member.id !== rootNode.member.id) { // Don't move the root
            moveCoupleUnit(node, paternalOffset, 0, "Paternal side");
          }
        });

        // Handle shared descendants with couple-aware gentle adjustment
        const centerX = (desiredMaternalX + desiredPaternalX) / 2;
        sharedDescendants.forEach(descendant => {
          if (!descendant.isSpouse && Math.abs(descendant.x - centerX) > 200) {
            const adjustment = (centerX - descendant.x) * 0.3;
            moveCoupleUnit(descendant, adjustment, 0, "Shared descendant adjustment");
          }
        });

        // Ensure parents are at correct positions and vertical levels
        maternalParent.x = desiredMaternalX;
        paternalParent.x = desiredPaternalX;
        const parentY = rootNode.y - VERTICAL_SPACING;
        maternalParent.y = parentY;
        paternalParent.y = parentY;

        console.log('Corrected family side separation complete');

      } else if (rootNode && rootNode.parents.length === 1) {
        // Single parent case
        const parent = rootNode.parents[0];
        const desiredX = rootNode.x - (ENHANCED_PARENT_SEPARATION * 0.6);
        const offset = desiredX - parent.x;

        const parentFamily = getConnectedFamily(parent);
        parentFamily.forEach(node => {
          if (node.member.id !== rootNode.member.id) {
            node.x += offset;
          }
        });

        parent.y = rootNode.y - VERTICAL_SPACING;
      }

      // STEP 3: Handle completely disconnected step-families
      // Find nodes that are not connected to the root node at all
      const connectedToRoot = new Set();
      const findAllConnected = (node: TreeNode | undefined, visited = new Set()) => {
        if (!node) return;
        if (visited.has(node.member.id)) return;
        visited.add(node.member.id);
        connectedToRoot.add(node.member.id);

        [...node.parents, ...node.children, ...node.siblings, ...node.spouses].forEach(related => {
          if (related && !visited.has(related.member.id)) {
            findAllConnected(related, visited);
          }
        });
      };

      findAllConnected(rootNode);

      // Find disconnected family groups (step-families)
      const disconnectedGroups: any[][] = [];
      Array.from(nodeMap.values()).forEach(node => {
        if (!connectedToRoot.has(node.member.id)) {
          // This node is not connected to the main family
          const stepFamily: any[] = [];
          const stepVisited = new Set();

          const collectStepFamily = (stepNode: TreeNode) => {
            if (stepVisited.has(stepNode.member.id)) return;
            stepVisited.add(stepNode.member.id);
            stepFamily.push(stepNode);

            [...stepNode.parents, ...stepNode.children, ...stepNode.siblings, ...stepNode.spouses].forEach(related => {
              if (related && !stepVisited.has(related.member.id) && !connectedToRoot.has(related.member.id)) {
                collectStepFamily(related);
              }
            });
          };

          collectStepFamily(node);

          if (stepFamily.length > 0) {
            disconnectedGroups.push(stepFamily);
          }
        }
      });

      // Position step-families to the far right
      disconnectedGroups.forEach((stepFamily, index) => {
        const stepFamilyOffset = (rootNode ? rootNode.x : 0) + STEP_FAMILY_OFFSET + (index * FAMILY_GROUP_SPACING);

        // Find the leftmost node in the step family to calculate offset
        const leftmostX = Math.min(...stepFamily.map(n => n.x));
        const offsetNeeded = stepFamilyOffset - leftmostX;

        stepFamily.forEach(stepNode => {
          stepNode.x += offsetNeeded;
        });

        console.log(`Positioned step-family ${index + 1}:`, stepFamily.map(n => n.member.first_name));
      });
    }

    const finalNodes = Array.from(nodeMap.values());
    finalNodes.forEach(node => {
      if (node.isSpouse && node.spouseOf) {
        // Re-position spouse next to their blood relative after any family moves
        const spouseX = node.spouseOf.x - (CARD_WIDTH / 2) - (SPOUSE_SPACING / 3);
        node.x = spouseX;
        node.y = node.spouseOf.y;
        console.log(`FINAL: Re-positioned spouse ${node.member.first_name} next to ${node.spouseOf.member.first_name} at (${Math.round(spouseX)}, ${Math.round(node.y)})`);
      }
    });



    // STEP 5: Enhanced spouse positioning that runs after ALL layout operations
    const ensureAllSpousesProperlyPositioned = (allNodes: TreeNode[]) => {
      console.log('=== FINAL SPOUSE POSITIONING CHECK ===');

      // First, validate that all couples are still together
      const couplesToFix: Array<{ spouse: TreeNode, anchor: TreeNode }> = [];

      allNodes.forEach(node => {
        if (node.isSpouse && node.spouseOf) {
          const anchor = node.spouseOf;
          const distance = Math.abs(node.x - anchor.x);

          // If they're more than a reasonable distance apart, they need fixing
          if (distance > 300) { // 300 pixels is our "couple separation threshold"
            couplesToFix.push({ spouse: node, anchor: anchor });
            console.log(`COUPLE SEPARATION DETECTED: ${node.member.first_name} is ${distance}px away from ${anchor.member.first_name}`);
          }
        }
      });

      // Fix any separated couples
      couplesToFix.forEach(({ spouse, anchor }) => {
        // Use the same side-by-side logic we discussed earlier
        const shouldPositionLeft = determineSidePreference(spouse, anchor);
        const SIDE_BY_SIDE_GAP = 12;

        let spouseX: number;
        if (shouldPositionLeft) {
          spouseX = anchor.x - CARD_WIDTH - SIDE_BY_SIDE_GAP;
        } else {
          spouseX = anchor.x + CARD_WIDTH + SIDE_BY_SIDE_GAP;
        }

        spouse.x = spouseX;
        spouse.y = anchor.y;

        console.log(`COUPLE REUNION: Repositioned ${spouse.member.first_name} next to ${anchor.member.first_name} at (${Math.round(spouseX)}, ${Math.round(spouse.y)})`);
      });

      console.log('=== FINAL SPOUSE POSITIONING COMPLETE ===');
    };

    // Helper function for consistent side preference
    function determineSidePreference(spouse: TreeNode, anchor: TreeNode): boolean {
      if (spouse.member.gender === 'female' && anchor.member.gender === 'male') {
        return true; // Female on left of male
      }
      if (spouse.member.gender === 'male' && anchor.member.gender === 'female') {
        return false; // Male on right of female
      }

      // Age-based fallback
      if (spouse.member.birth_date && anchor.member.birth_date) {
        return spouse.member.birth_date < anchor.member.birth_date;
      }

      // Alphabetical fallback
      return spouse.member.first_name.toLowerCase() < anchor.member.first_name.toLowerCase();
    }

    // Final spouse positioning after all other layout operations
    ensureAllSpousesProperlyPositioned(finalNodes);

    return finalNodes;
  }, [familyMembers, relationships, relationshipMap, firstMember]);


  // Calculate tree bounds for mini map
  const treeBounds = useMemo(() => {
    if (treeNodes.length === 0) {
      return { minX: 0, maxX: 400, minY: 0, maxY: 300, width: 400, height: 300 };
    }

    const minX = Math.min(...treeNodes.map(n => n.x - CARD_WIDTH / 2));
    const maxX = Math.max(...treeNodes.map(n => n.x + CARD_WIDTH / 2));
    const minY = Math.min(...treeNodes.map(n => n.y - CARD_HEIGHT / 2));
    const maxY = Math.max(...treeNodes.map(n => n.y + CARD_HEIGHT / 2));

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }, [treeNodes]);

  // Helper function moved outside of useMemo to avoid the circular dependency
  const getMemberFamilySide = useCallback((member: FamilyMember, firstMember: FamilyMember | null | undefined, rootNode: TreeNode | undefined): string => {
    if (!firstMember || !rootNode || member.id === firstMember.id) return 'center';

    if (rootNode.parents.length < 2) return 'neutral';

    const parentsArray = Array.isArray(rootNode.parents) ? rootNode.parents : [];
    const [maternalParent, paternalParent] = parentsArray;

    if (member.id === maternalParent.member.id) return 'maternal';
    if (member.id === paternalParent.member.id) return 'paternal';

    const memberNode = treeNodes.find(n => n.member.id === member.id);
    if (!memberNode) return 'neutral';

    const parentIds = memberNode.parents.map(p => p.member.id);
    const hasMaternalParent = parentIds.includes(maternalParent.member.id);
    const hasPaternalParent = parentIds.includes(paternalParent.member.id);

    if (hasMaternalParent && hasPaternalParent) return 'shared';
    if (hasMaternalParent) return 'maternal';
    if (hasPaternalParent) return 'paternal';

    // Check if connected to main family at all
    const isConnectedToMainFamily = (node: TreeNode, visited: Set<string> = new Set()): boolean => {
      if (visited.has(node.member.id)) return false;
      if (node.member.id === rootNode.member.id) return true;
      visited.add(node.member.id);

      return [...node.parents, ...node.children, ...node.siblings, ...node.spouses]
        .some(related => related && isConnectedToMainFamily(related, visited));
    };

    return isConnectedToMainFamily(memberNode) ? 'neutral' : 'step-family';
  }, [treeNodes]);

  // Mini map interaction handlers
  const handleMiniMapClick = useCallback((e: React.MouseEvent) => {
    const miniMapSvg = miniMapRef.current;
    if (!miniMapSvg) return;

    const rect = miniMapSvg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert mini map coordinates to tree coordinates
    const scaleX = treeBounds.width / MINI_MAP_WIDTH;
    const scaleY = treeBounds.height / MINI_MAP_HEIGHT;

    const treeX = treeBounds.minX + (clickX * scaleX);
    const treeY = treeBounds.minY + (clickY * scaleY);

    // Center the main view on the clicked point
    const container = document.querySelector('.family-tree-container') as HTMLElement;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;

      setPan({
        x: centerX - treeX * zoom,
        y: centerY - treeY * zoom
      });
    }
  }, [zoom, treeBounds]);

  const handleMiniMapMouseDown = useCallback((e: React.MouseEvent) => {
    setMiniMapDragging(true);
    handleMiniMapClick(e);
  }, [handleMiniMapClick]);

  const handleMiniMapMouseMove = useCallback((e: React.MouseEvent) => {
    if (miniMapDragging) {
      handleMiniMapClick(e);
    }
  }, [miniMapDragging, handleMiniMapClick]);

  const handleMiniMapMouseUp = useCallback(() => {
    setMiniMapDragging(false);
  }, []);



  // Auto-fit tree to mobile screen on initial load
  useEffect(() => {
    if (window.innerWidth > 768) return; // Only run on mobile
    if (!svgRef.current || treeNodes.length === 0) return;

    const treeWidth = treeBounds.width;
    const treeHeight = treeBounds.height;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Calculate best zoom to fit with minimal padding
    const zoomX = (screenW * 0.95) / treeWidth;
    const zoomY = (screenH * 0.95) / treeHeight;
    const fitZoom = Math.max(0.8, Math.min(zoomX, zoomY, 1.0)); // Min zoom 0.8, max 1.0

    setZoom(fitZoom);

    // If we have a first member, center on them; otherwise center the entire tree
    if (firstMember) {
      const firstMemberNode = treeNodes.find(n => n.member.id === firstMember.id);
      if (firstMemberNode) {
        // Center on the first member
        setPan({
          x: (screenW / 2) - firstMemberNode.x,
          y: (screenH / 2) - firstMemberNode.y
        });
      } else {
        // Fallback to centering the entire tree
        setPan({
          x: (screenW / 2) - ((treeBounds.minX + treeBounds.maxX) / 2) * fitZoom,
          y: (screenH / 2) - ((treeBounds.minY + treeBounds.maxY) / 2) * fitZoom
        });
      }
    } else {
      // Center the tree
      setPan({
        x: (screenW / 2) - ((treeBounds.minX + treeBounds.maxX) / 2) * fitZoom,
        y: (screenH / 2) - ((treeBounds.minY + treeBounds.maxY) / 2) * fitZoom
      });
    }
  }, [treeNodes, firstMember, treeBounds]);

  // Center on first member for desktop users on initial load
  useEffect(() => {
    if (window.innerWidth <= 768) return; // Only run on desktop
    if (!svgRef.current || treeNodes.length === 0 || !firstMember) return;

    const firstMemberNode = treeNodes.find(n => n.member.id === firstMember.id);
    if (firstMemberNode) {
      const container = document.querySelector('.family-tree-container') as HTMLElement;
      if (container) {
        const containerRect = container.getBoundingClientRect();

        // Center on the first member with a reasonable zoom level
        const centerX = containerRect.width / 2.5;  // added .5 to the divide to account for spacing taken up by member card and such
        const centerY = containerRect.height / 2;

        setPan({
          x: centerX - firstMemberNode.x,
          y: centerY - firstMemberNode.y
        });

        // Set a reasonable initial zoom
        setZoom(1.2);
      }
    }
  }, [treeNodes, firstMember]);

  // Add/remove body class for mobile tree view
  useEffect(() => {
    if (isMobile) {
      document.body.classList.add('tree-view-active');
      return () => {
        document.body.classList.remove('tree-view-active');
      };
    }
  }, [isMobile]);

  // Handle mouse events for pan and zoom
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isPreview) return; // Disable pan in preview mode
    const target = e.target as Element;
    if (target === svgRef.current || target.tagName === 'svg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  }, [pan, isPreview]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPreview) return; // Disable pan in preview mode
    if (isDragging) {
      e.preventDefault();
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart, isPreview]);

  const handleMouseUp = useCallback(() => {
    if (isPreview) return; // Disable pan in preview mode
    setIsDragging(false);
  }, [isPreview]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isPreview) return; // Disable zoom in preview mode
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)));
  }, [isPreview]);

  // Handle touch events for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isPreview) return; // Disable pan in preview mode
    const target = e.target as Element;
    // Only handle touch events on the SVG background, not on member cards
    if (target === svgRef.current || target.tagName === 'svg') {
      if (e.touches.length === 1) {
        // Single touch: start panning
        setIsDragging(true);
        setDragStart({
          x: e.touches[0].clientX - pan.x,
          y: e.touches[0].clientY - pan.y
        });
      }
    }
  }, [pan, isPreview]);

  const handleTouchEnd = useCallback(() => {
    if (isPreview) return; // Disable pan in preview mode
    setIsDragging(false);
  }, [isPreview]);

  useEffect(() => {
    if (isPreview) return; // Disable pan in preview mode
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        e.preventDefault();
        setPan({
          x: e.touches[0].clientX - dragStart.x,
          y: e.touches[0].clientY - dragStart.y
        });
      }
    };
    svg.addEventListener('touchmove', handler, { passive: false });
    return () => svg.removeEventListener('touchmove', handler);
  }, [isDragging, dragStart, isPreview]);

  const handleMemberClick = useCallback((member: FamilyMember, event: React.MouseEvent | React.TouchEvent) => {
    if (isPreview) return; // Disable clicks in preview mode
    // Stop propagation to prevent SVG touch events from interfering
    event.stopPropagation();
    event.preventDefault();

    // Prevent the touch from triggering panning
    if ('touches' in event) {
      setIsDragging(false);
    }

    // Check if we're on a mobile device
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // On mobile, always center the popup: don't set position, let CSS handle it
      setShowMemberPopup(member);
      onSelectMember(member);
      return;
    }

    // Desktop positioning logic
    const container = document.querySelector('.family-tree-container') as HTMLElement;
    const svgRect = svgRef.current?.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    if (!svgRect || !containerRect) return;

    // Handle both mouse and touch events
    let clientX: number, clientY: number;
    if ('touches' in event) {
      // Touch event
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      // Mouse event
      clientX = event.clientX;
      clientY = event.clientY;
    }

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
  }, [isPreview, onSelectMember]);

  const closePopup = () => {
    setShowMemberPopup(null);
  };

  // Close popup when selected member is cleared or when a member is deleted
  useEffect(() => {
    if (!selectedMember && showMemberPopup) {
      setShowMemberPopup(null);
    }
  }, [selectedMember, showMemberPopup]);

  const generateConnections = () => {
    const lines: JSX.Element[] = [];

    treeNodes.forEach((node) => {
      // Parent-child connections with proper routing
      node.children.forEach((child) => {
        const parentY = node.y + CARD_HEIGHT / 2;
        const childY = child.y - CARD_HEIGHT / 2;
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
          const leftX = Math.min(node.x, spouse.x) + CARD_WIDTH / 2;
          const rightX = Math.max(node.x, spouse.x) - CARD_WIDTH / 2;
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
                  x1={current.x + CARD_WIDTH / 2}
                  y1={y}
                  x2={next.x - CARD_WIDTH / 2}
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

  // Calculate current viewport bounds for mini map
  const viewportBounds = useMemo(() => {
    const container = document.querySelector('.family-tree-container') as HTMLElement;
    if (!container) return { x: 0, y: 0, width: 100, height: 100 };

    const containerRect = container.getBoundingClientRect();

    // Convert viewport to tree coordinates
    const viewportLeft = -pan.x / zoom;
    const viewportTop = -pan.y / zoom;
    const viewportWidth = containerRect.width / zoom;
    const viewportHeight = containerRect.height / zoom;

    return {
      x: viewportLeft,
      y: viewportTop,
      width: viewportWidth,
      height: viewportHeight
    };
  }, [pan, zoom]);

  if (familyMembers.length === 0) {
    return (
      <div className="empty-state">
        <h2>Family Tree</h2>
        <p>No family members added yet. Add some to see the tree!</p>
      </div>
    );
  }

  if (familyMembers.length === 0) {
    return (
      <div className="empty-state">
        <h2>Family Tree</h2>
        <p>No family members added yet. Add some to see the tree!</p>
      </div>
    );
  }

  return (
    <div className="family-tree-container" style={{ pointerEvents: isPreview ? 'none' : 'auto' }}>
      {/* Mobile close button */}
      {isMobile && !isPreview && (
        <button
          className="treeview-close-btn"
          onClick={() => {
            if (onClose) {
              onClose();
            } else {
              // Fallback: reset view if no close handler provided
              setZoom(1);
              setPan({ x: 0, y: 0 });
              console.log('Close button clicked - no handler provided');
            }
          }}
          aria-label="Close family tree"
        >
          ×
        </button>
      )}
      {!isPreview && (
        <>
          {/* Left side controls: zoom in/out, reset view */}
          <div className="family-tree-controls">
            <button
              onClick={() => applyZoomFactor(1.2)}
              className="control-button"
            >
              Zoom In
            </button>
            <button
              onClick={() => applyZoomFactor(0.9)}
              className="control-button"
            >
              Zoom Out
            </button>
            <button
              onClick={() => {
                if (firstMember) {
                  const firstMemberNode = treeNodes.find(n => n.member.id === firstMember.id);
                  if (firstMemberNode) {
                    const container = document.querySelector('.family-tree-container') as HTMLElement;
                    if (container) {
                      const containerRect = container.getBoundingClientRect();
                      const targetX = containerRect.width * 0.2; // Position on the left
                      const centerY = containerRect.height / 2;
                      const newZoom = 1.0;
                      setPan({
                        x: targetX - firstMemberNode.x * newZoom,
                        y: centerY - firstMemberNode.y * newZoom,
                      });
                      setZoom(newZoom);
                    }
                  }
                } else {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }
              }}
              className="control-button secondary"
            >
              Reset View
            </button>
            {firstMember && (
              <button
                onClick={() => {
                  const firstMemberNode = treeNodes.find(n => n.member.id === firstMember.id);
                  if (firstMemberNode) {
                    const container = document.querySelector('.family-tree-container') as HTMLElement;
                    if (container) {
                      const containerRect = container.getBoundingClientRect();
                      const centerX = containerRect.width / 2;
                      const centerY = containerRect.height / 2;
                      const newZoom = 1.2;
                      setPan({
                        x: centerX - firstMemberNode.x * newZoom,
                        y: centerY - firstMemberNode.y * newZoom
                      });
                      setZoom(newZoom);
                    }
                  }
                }}
                className="control-button secondary"
                title={`Center on ${firstMember.first_name} ${firstMember.last_name} (first member)`}
              >
                Center on First Member
              </button>
            )}
          </div>

          {/* Fullscreen button on the right */}
          {!isFullscreen && onFullscreen && (
            <div className="family-tree-controls-right">
              <button
                onClick={onFullscreen}
                className="control-button fullscreen-button"
                title="Open in fullscreen view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
                Fullscreen
              </button>
            </div>
          )}
        </>
      )}

      {/* Mini Map */}
      {!isMobile && showMiniMap && !isPreview && treeNodes.length > 0 && (
        <div className="mini-map-container" style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          width: `${MINI_MAP_WIDTH}px`,
          height: `${MINI_MAP_HEIGHT}px`,
          background: 'rgba(255, 255, 255, 0.95)',
          border: '2px solid #E5E7EB',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            right: '4px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            fontWeight: '600',
            color: '#374151',
            background: 'rgba(249, 250, 251, 0.9)',
            borderRadius: '4px',
            padding: '0 6px'
          }}>
            <span>Mini Map</span>
            <button
              onClick={() => setShowMiniMap(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#6B7280',
                padding: '0',
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Hide mini map"
            >
              ×
            </button>
          </div>
          <svg
            ref={miniMapRef}
            width={MINI_MAP_WIDTH}
            height={MINI_MAP_HEIGHT}
            style={{
              cursor: 'pointer',
              marginTop: '24px'
            }}
            onMouseDown={handleMiniMapMouseDown}
            onMouseMove={handleMiniMapMouseMove}
            onMouseUp={handleMiniMapMouseUp}
            onMouseLeave={handleMiniMapMouseUp}
          >
            {/* Tree nodes in mini map */}
            {treeNodes.map(node => {
              // Use a more compact scaling with padding
              const padding = 15;
              const miniX = padding + ((node.x - treeBounds.minX) / treeBounds.width) * (MINI_MAP_WIDTH - padding * 2);
              const miniY = padding + ((node.y - treeBounds.minY) / treeBounds.height) * (MINI_MAP_HEIGHT - padding * 2);

              return (
                <rect
                  key={node.member.id}
                  x={miniX - MINI_MAP_CARD_WIDTH / 2}
                  y={miniY - MINI_MAP_CARD_HEIGHT / 2}
                  width={MINI_MAP_CARD_WIDTH}
                  height={MINI_MAP_CARD_HEIGHT}
                  fill={selectedMember?.id === node.member.id ? '#6366F1' :
                    node.member.gender === 'male' ? '#3B82F6' :
                      node.member.gender === 'female' ? '#EC4899' :
                        node.member.gender === 'other' ? '#10B981' : '#9CA3AF'}
                  stroke={node.isSpouse ? '#FFFFFF' : 'none'}
                  strokeWidth={node.isSpouse ? '1' : '0'}
                  rx="1"
                />
              );
            })}

            {/* Viewport indicator */}
            <rect
              x={Math.max(15, Math.min(MINI_MAP_WIDTH - 15 - 1, 15 + ((viewportBounds.x - treeBounds.minX) / treeBounds.width) * (MINI_MAP_WIDTH - 30)))}
              y={Math.max(15, Math.min(MINI_MAP_HEIGHT - 15 - 1, 15 + ((viewportBounds.y - treeBounds.minY) / treeBounds.height) * (MINI_MAP_HEIGHT - 30)))}
              width={Math.min(MINI_MAP_WIDTH - 30, Math.max(1, (viewportBounds.width / treeBounds.width) * (MINI_MAP_WIDTH - 30)))}
              height={Math.min(MINI_MAP_HEIGHT - 30, Math.max(1, (viewportBounds.height / treeBounds.height) * (MINI_MAP_HEIGHT - 30)))}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2"
              rx="2"
            />
          </svg>
        </div>
      )}

      {/* Mini map toggle button (when hidden) */}
      {!isMobile && !showMiniMap && (
        <button
          onClick={() => setShowMiniMap(true)}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '2px solid #E5E7EB',
            borderRadius: '8px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            color: '#374151',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000
          }}
          title="Show mini map"
        >
          Show Mini Map
        </button>
      )}

      {/* Main SVG */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className={`family-tree-svg ${isDragging ? 'dragging' : 'grabbable'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
              transform={`translate(${node.x - CARD_WIDTH / 2}, ${node.y - CARD_HEIGHT / 2})`}
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''} ${node.isSpouse ? 'spouse-card' : ''} ${firstMember?.id === node.member.id ? 'first-member' : ''}`}
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
                  x={CARD_WIDTH / 2}
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
                  x={CARD_WIDTH / 2}
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
              transform={`translate(${node.x - CARD_WIDTH / 2}, ${node.y - CARD_HEIGHT / 2})`}
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''} 
  ${firstMember?.id === node.member.id ? 'first-member' : ''}
  ${(() => {
                  const rootNode = treeNodes.find(n => n.member.id === firstMember?.id);
                  const side = getMemberFamilySide(node.member, firstMember, rootNode);
                  return side !== 'center' && side !== 'neutral' ? side : '';
                })()}
  ${node.isSpouse ? 'spouse-card' : ''}`}
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
                x={CARD_WIDTH / 2}
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
                x={CARD_WIDTH / 2}
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
                  x={CARD_WIDTH / 2}
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
                  x={CARD_WIDTH / 2}
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

              {/* First member indicator */}
              {firstMember?.id === node.member.id && (
                <g>
                  <circle
                    cx={CARD_WIDTH - 15}
                    cy={CARD_HEIGHT - 15}
                    r="12"
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    x={CARD_WIDTH - 15}
                    y={CARD_HEIGHT - 10}
                    textAnchor="middle"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    1st
                  </text>
                </g>
              )}
            </g>
          ))}
        </g>

        {/* Add shadow filter definition */}
        <defs>
          <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.2" />
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
        {firstMember && (
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: '#f59e0b', height: '3px', width: '20px' }}></div>
            <span>First Member Created</span>
          </div>
        )}
      </div>

      {/* Member popup */}
      {showMemberPopup && (
        <>
          {/* Backdrop overlay */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            onClick={closePopup}
          />
          <div
            className="member-popup"
            style={{
              left: window.innerWidth <= 768 ? undefined : popupPosition.x,
              top: window.innerWidth <= 768 ? undefined : popupPosition.y,
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
                onClick={() => {
                  onDeleteMember(showMemberPopup.id);
                  closePopup(); // Close popup immediately when delete is clicked
                }}
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
        </>
      )}
    </div>
  );
};

export default FamilyTree;