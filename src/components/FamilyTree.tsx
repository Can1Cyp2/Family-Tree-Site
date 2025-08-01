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
  const MIN_CHILD_SPACING = 250; // (legacy, not used for child layout)
  const CHILD_GAP = 40; // gap between children to prevent overlap

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

    // --- STRUCTURE TREE LAYOUT ---
    let totalLayoutWidth = 100; // Start with some initial padding

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

      // Helper function to determine if someone is a blood relative (has parents/siblings in the tree)
      const isBloodRelative = (node: TreeNode): boolean => {
        return node.parents.length > 0 || node.siblings.length > 0;
      };

      // Helper function to find the best blood relative spouse for a person
      const findBloodRelativeSpouse = (node: TreeNode): TreeNode | null => {
        if (node.spouses.length === 0) return null;

        // Find spouses who are blood relatives (have parents or siblings)
        const bloodRelativeSpouses = node.spouses.filter(spouse => isBloodRelative(spouse));

        if (bloodRelativeSpouses.length === 0) return null;

        // If multiple blood relative spouses, pick the one with more blood relationships
        return bloodRelativeSpouses.reduce((best, current) => {
          const bestScore = best.parents.length + best.siblings.length + best.children.length;
          const currentScore = current.parents.length + current.siblings.length + current.children.length;
          return currentScore > bestScore ? current : best;
        });
      };

      // Sort nodes to process blood relatives first
      const sortedNodes = [...nodes].sort((a, b) => {
        const aIsBlood = isBloodRelative(a);
        const bIsBlood = isBloodRelative(b);

        // Blood relatives first
        if (aIsBlood && !bIsBlood) return -1;
        if (!aIsBlood && bIsBlood) return 1;

        // Among blood relatives, those with more relationships first
        if (aIsBlood && bIsBlood) {
          const aScore = a.parents.length + a.siblings.length + a.children.length;
          const bScore = b.parents.length + b.siblings.length + b.children.length;
          return bScore - aScore;
        }

        // Among non-blood relatives, those with children first (potential family roots)
        return b.children.length - a.children.length;
      });

      sortedNodes.forEach(node => {
        if (processed.has(node.member.id)) return;

        const nodeIsBlood = isBloodRelative(node);

        // If this person is not a blood relative, check if they should be treated as a spouse
        if (!nodeIsBlood) {
          const bloodRelativeSpouse = findBloodRelativeSpouse(node);

          if (bloodRelativeSpouse && !processed.has(bloodRelativeSpouse.member.id)) {
            // This person should be processed as a spouse when we process their blood relative spouse
            return;
          } else if (bloodRelativeSpouse && processed.has(bloodRelativeSpouse.member.id)) {
            // Their blood relative spouse is already processed, skip this person as they'll be added as a spouse
            return;
          }
          // If no blood relative spouse, this person will be treated as a family root
        }

        console.log(`Processing ${node.member.first_name} as family root (blood relative: ${nodeIsBlood})`);

        // Start a new family unit with this node
        const familyUnit: TreeNode[] = [node];
        processed.add(node.member.id);

        // Add all siblings of this node (only if this node is a blood relative)
        if (nodeIsBlood) {
          node.siblings.forEach(sibling => {
            if (!processed.has(sibling.member.id)) {
              familyUnit.push(sibling);
              processed.add(sibling.member.id);
            }
          });
        }

        // Now add spouses for everyone in the family unit
        const spousesToAdd: TreeNode[] = [];
        familyUnit.forEach(member => {
          member.spouses.forEach(spouse => {
            if (!processed.has(spouse.member.id)) {
              const spouseIsBlood = isBloodRelative(spouse);

              // If the spouse is a blood relative, add them as a blood relative to the family unit
              if (spouseIsBlood) {
                console.log(`Adding ${spouse.member.first_name} as blood relative spouse to family unit`);
                familyUnit.push(spouse);
                processed.add(spouse.member.id);
              } else {
                // If the spouse is not a blood relative, mark them as a spouse
                console.log(`Adding ${spouse.member.first_name} as spouse of ${member.member.first_name}`);
                spouse.isSpouse = true;
                spouse.spouseOf = member;
                spousesToAdd.push(spouse);
                processed.add(spouse.member.id);
              }
            }
          });
        });

        // Add all the spouses to the family unit
        familyUnit.push(...spousesToAdd);

        // Sort the family unit to position spouses correctly
        familyUnit.sort((a, b) => {
          // Blood relatives come first, then their spouses
          const aIsSpouse = a.isSpouse || false;
          const bIsSpouse = b.isSpouse || false;

          if (!aIsSpouse && bIsSpouse) return -1;
          if (aIsSpouse && !bIsSpouse) return 1;

          // If both are blood relatives or both are spouses, use existing sorting logic
          if (!aIsSpouse && !bIsSpouse) {
            // Both are blood relatives - check if they're siblings or spouses
            const aChildren = a.children.map(c => c.member.id);
            const bChildren = b.children.map(c => c.member.id);
            const sharedChildren = aChildren.filter(id => bChildren.includes(id));

            if (sharedChildren.length > 0) {
              // They are spouses with shared children - sort by individual children count
              const calculateIndividualWeight = (node: TreeNode, sharedChildIds: string[]): number => {
                if (node.children.length === 0) return 0;
                let weight = 0;
                node.children.forEach(child => {
                  if (!sharedChildIds.includes(child.member.id)) {
                    weight += 1;
                    weight += calculateIndividualWeight(child, sharedChildIds);
                  }
                });
                return weight;
              };

              const aIndividualWeight = calculateIndividualWeight(a, sharedChildren);
              const bIndividualWeight = calculateIndividualWeight(b, sharedChildren);

              if (aIndividualWeight !== bIndividualWeight) {
                return aIndividualWeight - bIndividualWeight;
              }
            }

            // Check if they're siblings (same parents)
            const aParents = a.parents.map(p => p.member.id).sort().join('-');
            const bParents = b.parents.map(p => p.member.id).sort().join('-');

            if (aParents === bParents && aParents !== '') {
              // They are siblings - sort by birth date
              const aDate = a.member.birth_date || '1900-01-01';
              const bDate = b.member.birth_date || '1900-01-01';
              return aDate.localeCompare(bDate);
            }
          }

          // Default sort by birth date
          const aDate = a.member.birth_date || '1900-01-01';
          const bDate = b.member.birth_date || '1900-01-01';
          return aDate.localeCompare(bDate);
        });

        familyUnits.push(familyUnit);
      });

      console.log('Family units created:', familyUnits.map(unit =>
        unit.map(member => `${member.member.first_name} (isSpouse: ${member.isSpouse}, spouseOf: ${member.spouseOf?.member.first_name || 'none'})`)
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

      // MIGHT CHANGE LATER: Don't add arbitrary spouse space:  spouses position relative to their blood relatives
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
        sib.y = depth * VERTICAL_SPACING + 100;
        centers.push(sibCenter);
      });

      // Position spouses next to their blood relatives
      spouses.forEach((spouse) => {
        if (spouse.spouseOf) {
          // Position spouse to the right of their blood relative with proper spacing
          const spouseX = spouse.spouseOf.x + (CARD_WIDTH / 2) + (SPOUSE_SPACING / 2);
          spouse.x = spouseX;
          spouse.y = spouse.spouseOf.y; // Same y position

          console.log(`Positioned spouse ${spouse.member.first_name} next to ${spouse.spouseOf.member.first_name} at (${Math.round(spouseX)}, ${Math.round(spouse.y)})`);
        }
      });

      return { width: totalWidth, centers };
    };

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
          node.children.every(child =>                     // All children have siblings (form a sibling group)
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
      const familyUnits = createFamilyUnits(roots);
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

        // Determine which parent should be mother (left) and father (right)
        let mother = parent1;
        let father = parent2;

        // If we can determine gender, use that
        if (parent1.member.gender === 'female' && parent2.member.gender === 'male') {
          mother = parent1;
          father = parent2;
        } else if (parent1.member.gender === 'male' && parent2.member.gender === 'female') {
          mother = parent2;
          father = parent1;
        }
        // Otherwise just use the current assignment (parent1 = mother, parent2 = father)

        console.log(`Positioning parents: ${mother.member.first_name} (mother/left), ${father.member.first_name} (father/right)`);

        // Calculate the offset needed to move entire family trees
        const rootX = rootNode.x;
        const currentMotherX = mother.x;
        const currentFatherX = father.x;

        // Desired positions relative to root
        const desiredMotherX = rootX - FAMILY_GROUP_SPACING;
        const desiredFatherX = rootX + FAMILY_GROUP_SPACING;

        // Calculate how much we need to move each family tree
        const motherOffset = desiredMotherX - currentMotherX;
        const fatherOffset = desiredFatherX - currentFatherX;

        // Get mother's entire family tree
        const motherFamily = getConnectedFamily(mother);
        // Get father's entire family tree  
        const fatherFamily = getConnectedFamily(father);

        // Remove any overlap (nodes that appear in both families - like shared children)
        const sharedNodes = new Set(
          motherFamily.filter(node =>
            fatherFamily.some(fNode => fNode.member.id === node.member.id)
          ).map(node => node.member.id)
        );

        // Don't move shared nodes (like the root member or shared children)
        const uniqueMotherFamily = motherFamily.filter(node => !sharedNodes.has(node.member.id));
        const uniqueFatherFamily = fatherFamily.filter(node => !sharedNodes.has(node.member.id));

        console.log('Mother family to move:', uniqueMotherFamily.map(n => n.member.first_name));
        console.log('Father family to move:', uniqueFatherFamily.map(n => n.member.first_name));
        console.log('Shared nodes (not moving):', Array.from(sharedNodes));

        // Move mother's family tree
        uniqueMotherFamily.forEach(node => {
          node.x += motherOffset;
          console.log(`Moved ${node.member.first_name} by ${motherOffset} to x=${Math.round(node.x)}`);
        });

        // Move father's family tree
        uniqueFatherFamily.forEach(node => {
          node.x += fatherOffset;
          console.log(`Moved ${node.member.first_name} by ${fatherOffset} to x=${Math.round(node.x)}`);
        });

        console.log('Parent positioning complete');
      } else if (rootNode && rootNode.parents.length === 1) {
        // Single parent - just position them to the left
        const parent = rootNode.parents[0];
        const desiredX = rootNode.x - FAMILY_GROUP_SPACING;
        const offset = desiredX - parent.x;

        const parentFamily = getConnectedFamily(parent);
        parentFamily.forEach(node => {
          if (node.member.id !== rootNode.member.id) { // Don't move the root
            node.x += offset;
          }
        });
      }
    }

    return Array.from(nodeMap.values());
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
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
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

                      setPan({
                        x: centerX - firstMemberNode.x,
                        y: centerY - firstMemberNode.y
                      });
                      setZoom(1.2);
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
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''} ${firstMember?.id === node.member.id ? 'first-member' : ''}`}
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