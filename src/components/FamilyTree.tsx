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
  onClosePopup?: () => void;
  firstMember?: FamilyMember | null;
  isPreview?: boolean;
  externalPan?: { dx: number; dy: number } | null;
  externalZoom?: number | null;
  onFullscreen?: () => void;
  onClose?: () => void;
  isFullscreen?: boolean;
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
  side: 'left' | 'right' | 'center' | null;
  isMainLine: boolean;
  spouseType: 'main-line' | 'attached';
  attachedTo?: TreeNode;
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
  isPreview = false,
  onFullscreen,
  onClose,
  isFullscreen = false,
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
  const MAIN_LINE_SPACING = 600;
  const VERTICAL_SPACING = 240;
  const SIBLING_SPACING = 280;
  const SIBLING_GROUP_SPACING = 400;
  const SPOUSE_ATTACHMENT_OFFSET = 200;

  // Mini map constants
  const MINI_MAP_WIDTH = 200;
  const MINI_MAP_HEIGHT = 150;
  const MINI_MAP_CARD_WIDTH = 6;
  const MINI_MAP_CARD_HEIGHT = 4;

  // Handle external pan and zoom
  useEffect(() => {
    if (externalPan && (externalPan.dx !== 0 || externalPan.dy !== 0)) {
      setPan(prev => ({
        x: prev.x + externalPan.dx,
        y: prev.y + externalPan.dy,
      }));
    }
  }, [externalPan?.dx, externalPan?.dy]);

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
    if (isPreview) return;
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

  // Helper function to check if someone is a main line ancestor
  const isDirectAncestorOfFirstMember = useCallback((member: FamilyMember): boolean => {
    if (!firstMember) return false;

    const relations = relationshipMap.get(firstMember.id);
    if (!relations) return false;

    // Check if member is a direct parent
    const isParent = relations.parents.some(p => p.member.id === member.id);
    if (isParent) return true;

    // Check if member is a grandparent (parent of a parent)
    const isGrandparent = relations.parents.some(parent => {
      const parentRelations = relationshipMap.get(parent.member.id);
      return parentRelations?.parents.some(grandparent => grandparent.member.id === member.id);
    });

    return isGrandparent;
  }, [firstMember, relationshipMap]);

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
        processed: false,
        side: null,
        isMainLine: false,
        spouseType: 'attached',
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

    // Assign sides and main line status
    if (firstMember) {
      const firstMemberNode = nodeMap.get(firstMember.id);
      if (firstMemberNode) {
        // Find direct parents of first member
        const mother = firstMemberNode.parents.find(p => p.member.gender === 'female');
        const father = firstMemberNode.parents.find(p => p.member.gender === 'male');

        // Set first member as center
        firstMemberNode.side = 'center';
        firstMemberNode.isMainLine = true;

        // Assign mother's line to left (maternal side)
        if (mother) {
          assignSideRecursively(mother, 'left', nodeMap, new Set());
        }

        // Assign father's line to right (paternal side)
        if (father) {
          assignSideRecursively(father, 'right', nodeMap, new Set());
        }
      }
    }

    // Helper function to assign sides recursively
    function assignSideRecursively(
      node: TreeNode,
      side: 'left' | 'right',
      nodeMap: Map<string, TreeNode>,
      visited: Set<string>
    ) {
      if (visited.has(node.member.id)) return;
      visited.add(node.member.id);

      node.side = side;
      node.isMainLine = true;

      // ONLY assign side to blood relatives on the SAME side
      // Parents and siblings get the same side
      [...node.parents, ...node.siblings].forEach(relative => {
        if (!visited.has(relative.member.id)) {
          assignSideRecursively(relative, side, nodeMap, visited);
        }
      });

      // Children only get assigned if they're not the first member
      node.children.forEach(child => {
        if (!visited.has(child.member.id) && child.member.id !== firstMember?.id) {
          assignSideRecursively(child, side, nodeMap, visited);
        }
      });

      // Handle spouses
      node.spouses.forEach(spouse => {
        if (!visited.has(spouse.member.id)) {
          const isMainLineSpouse = isDirectAncestorOfFirstMember(spouse.member);

          if (isMainLineSpouse) {
            // Main line spouse gets spaced out on same side
            spouse.side = side;
            spouse.isMainLine = true;
            spouse.spouseType = 'main-line';
          } else {
            // Attached spouse stays close to their blood relative
            spouse.side = side;
            spouse.isMainLine = false;
            spouse.spouseType = 'attached';
            spouse.attachedTo = node;
          }
          visited.add(spouse.member.id);
        }
      });
    }

    // Calculate generations
    if (firstMember) {
      const firstMemberNode = nodeMap.get(firstMember.id);
      if (firstMemberNode) {
        calculateGenerations(firstMemberNode, 0, new Set());
      }
    }

    function calculateGenerations(node: TreeNode, generation: number, visited: Set<string>) {
      if (visited.has(node.member.id)) return;
      visited.add(node.member.id);

      node.generation = generation;

      // Parents are older generation
      node.parents.forEach(parent => {
        if (!visited.has(parent.member.id)) {
          calculateGenerations(parent, generation - 1, visited);
        }
      });

      // Children are younger generation
      node.children.forEach(child => {
        if (!visited.has(child.member.id)) {
          calculateGenerations(child, generation + 1, visited);
        }
      });

      // Spouses same generation
      node.spouses.forEach(spouse => {
        if (!visited.has(spouse.member.id)) {
          calculateGenerations(spouse, generation, visited);
        }
      });
    }

    // Layout positioning
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    // Separate nodes by side and type
    const leftMainLine = Array.from(nodeMap.values()).filter(n => n.side === 'left' && n.isMainLine);
    const rightMainLine = Array.from(nodeMap.values()).filter(n => n.side === 'right' && n.isMainLine);
    const centerNodes = Array.from(nodeMap.values()).filter(n => n.side === 'center');
    const attachedSpouses = Array.from(nodeMap.values()).filter(n => n.spouseType === 'attached');

    // Layout center (first member)
    centerNodes.forEach((node, index) => {
      node.x = centerX;
      node.y = centerY + (index * VERTICAL_SPACING);
    });

    // Layout left side (maternal line)
    if (leftMainLine.length > 0) {
      layoutSideTree(leftMainLine, 'left', centerX - MAIN_LINE_SPACING, centerY);
    }

    // Layout right side (paternal line)
    if (rightMainLine.length > 0) {
      layoutSideTree(rightMainLine, 'right', centerX + MAIN_LINE_SPACING, centerY);
    }

    // Position attached spouses close to their blood relatives
    attachedSpouses.forEach(spouse => {
      if (spouse.attachedTo) {
        const offset = spouse.attachedTo.side === 'left' ? -SPOUSE_ATTACHMENT_OFFSET : SPOUSE_ATTACHMENT_OFFSET;
        spouse.x = spouse.attachedTo.x + offset;
        spouse.y = spouse.attachedTo.y;
      }
    });

    function calculateSubtreeWidth(node: TreeNode, visited: Set<string> = new Set()): number {
      if (visited.has(node.member.id)) return CARD_WIDTH;
      visited.add(node.member.id);

      // If no children, just return card width
      if (node.children.length === 0) {
        return CARD_WIDTH;
      }

      // Calculate total width needed for all children and their subtrees
      let totalChildrenWidth = 0;
      node.children.forEach(child => {
        totalChildrenWidth += calculateSubtreeWidth(child, visited);
      });

      // Add spacing between children
      const childSpacing = (node.children.length - 1) * SIBLING_SPACING;
      totalChildrenWidth += childSpacing;

      // Return the maximum of: card width, or total children width
      return Math.max(CARD_WIDTH, totalChildrenWidth);
    }

    function layoutSideTree(nodes: TreeNode[], side: 'left' | 'right', baseX: number, baseY: number) {
      // Group by generation
      const generations: { [key: number]: TreeNode[] } = {};
      nodes.forEach(node => {
        if (!generations[node.generation]) {
          generations[node.generation] = [];
        }
        generations[node.generation].push(node);
      });

      const direction = side === 'left' ? -1 : 1;

      // Calculate subtree widths for all nodes
      const subtreeWidths = new Map<string, number>();
      nodes.forEach(node => {
        subtreeWidths.set(node.member.id, calculateSubtreeWidth(node));
      });

      // Layout generations from oldest to youngest
      const sortedGenerations = Object.keys(generations)
        .map(g => parseInt(g))
        .sort((a, b) => a - b);

      sortedGenerations.forEach(generation => {
        const genNodes = generations[generation];

        // Group siblings together
        const siblingGroups = groupSiblings(genNodes);

        const genY = baseY + (generation * VERTICAL_SPACING);
        let currentX = baseX;

        siblingGroups.forEach((siblingGroup) => {
          // Sort siblings by birth date for consistent ordering
          siblingGroup.sort((a, b) => {
            const aDate = a.member.birth_date || '1900-01-01';
            const bDate = b.member.birth_date || '1900-01-01';
            return aDate.localeCompare(bDate);
          });

          // Calculate total width needed for this sibling group
          let groupWidth = 0;
          siblingGroup.forEach(sibling => {
            const subtreeWidth = subtreeWidths.get(sibling.member.id) || CARD_WIDTH;
            groupWidth += subtreeWidth;
          });

          // Add spacing between siblings in the group
          groupWidth += (siblingGroup.length - 1) * SIBLING_SPACING;

          // Position siblings within the group
          let siblingX = currentX - (direction * groupWidth / 2);

          siblingGroup.forEach((sibling) => {
            const subtreeWidth = subtreeWidths.get(sibling.member.id) || CARD_WIDTH;

            // Position this sibling at the center of their subtree space
            sibling.x = siblingX + (direction * subtreeWidth / 2);
            sibling.y = genY;

            // Move to next sibling position
            siblingX += direction * (subtreeWidth + SIBLING_SPACING);
          });

          // Move to next group position
          currentX += direction * (groupWidth + SIBLING_GROUP_SPACING);
        });
      });

      // Second pass: Align children under their parents
      alignChildrenUnderParents(nodes);
    }

    function alignChildrenUnderParents(nodes: TreeNode[]) {
      // Group by generation and process from older to younger
      const generations: { [key: number]: TreeNode[] } = {};
      nodes.forEach(node => {
        if (!generations[node.generation]) {
          generations[node.generation] = [];
        }
        generations[node.generation].push(node);
      });

      const sortedGenerations = Object.keys(generations)
        .map(g => parseInt(g))
        .sort((a, b) => a - b);

      // Skip the oldest generation (they're already positioned)
      for (let i = 1; i < sortedGenerations.length; i++) {
        const generation = sortedGenerations[i];
        const genNodes = generations[generation];

        genNodes.forEach(node => {
          // Find this node's parents
          const parents = node.parents.filter(p => p.side === node.side);

          if (parents.length > 0) {
            // If multiple parents (rare), use the average position
            const avgParentX = parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length;

            // Center children under their parent(s)
            const siblings = node.siblings.filter(s =>
              s.side === node.side &&
              s.generation === node.generation &&
              s.parents.some(p => parents.some(parent => parent.member.id === p.member.id))
            );

            // Include this node in the siblings list
            const allSiblings = [node, ...siblings.filter(s => s.member.id !== node.member.id)]
              .sort((a, b) => {
                const aDate = a.member.birth_date || '1900-01-01';
                const bDate = b.member.birth_date || '1900-01-01';
                return aDate.localeCompare(bDate);
              });

            if (allSiblings.length > 1) {
              // Calculate total width for siblings
              const totalWidth = (allSiblings.length - 1) * SIBLING_SPACING;
              const startX = avgParentX - (totalWidth / 2);

              // Position all siblings centered under parent
              allSiblings.forEach((sibling, index) => {
                sibling.x = startX + (index * SIBLING_SPACING);
              });
            } else {
              // Single child - center directly under parent
              node.x = avgParentX;
            }
          }
        });
      }
    }

    function groupSiblings(nodes: TreeNode[]): TreeNode[][] {
      const groups: TreeNode[][] = [];
      const processed = new Set<string>();

      nodes.forEach(node => {
        if (processed.has(node.member.id)) return;

        const siblingGroup = [node];
        processed.add(node.member.id);

        // Find all siblings in the same generation and side
        node.siblings.forEach(sibling => {
          if (nodes.some(n => n.member.id === sibling.member.id) &&
            !processed.has(sibling.member.id)) {
            siblingGroup.push(sibling);
            processed.add(sibling.member.id);
          }
        });

        groups.push(siblingGroup);
      });

      return groups;
    }

    return Array.from(nodeMap.values());
  }, [familyMembers, relationships, relationshipMap, firstMember, dimensions, isDirectAncestorOfFirstMember]);

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

    const scaleX = treeBounds.width / MINI_MAP_WIDTH;
    const scaleY = treeBounds.height / MINI_MAP_HEIGHT;

    const treeX = treeBounds.minX + (clickX * scaleX);
    const treeY = treeBounds.minY + (clickY * scaleY);

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

  // Auto-fit and center logic
  useEffect(() => {
    if (!svgRef.current || treeNodes.length === 0) return;

    if (isMobile) {
      // Mobile: fit entire tree
      const treeWidth = treeBounds.width;
      const treeHeight = treeBounds.height;
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      const zoomX = (screenW * 0.95) / treeWidth;
      const zoomY = (screenH * 0.95) / treeHeight;
      const fitZoom = Math.max(0.8, Math.min(zoomX, zoomY, 1.0));

      setZoom(fitZoom);

      if (firstMember) {
        const firstMemberNode = treeNodes.find(n => n.member.id === firstMember.id);
        if (firstMemberNode) {
          setPan({
            x: (screenW / 2) - firstMemberNode.x,
            y: (screenH / 2) - firstMemberNode.y
          });
        }
      }
    } else {
      // Desktop: center on first member
      if (firstMember) {
        const firstMemberNode = treeNodes.find(n => n.member.id === firstMember.id);
        if (firstMemberNode) {
          const container = document.querySelector('.family-tree-container') as HTMLElement;
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const centerX = containerRect.width / 2.5;
            const centerY = containerRect.height / 2;

            setPan({
              x: centerX - firstMemberNode.x,
              y: centerY - firstMemberNode.y
            });

            setZoom(1.2);
          }
        }
      }
    }
  }, [treeNodes, firstMember, treeBounds, isMobile]);

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
    if (isPreview) return;
    const target = e.target as Element;
    if (target === svgRef.current || target.tagName === 'svg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  }, [pan, isPreview]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPreview) return;
    if (isDragging) {
      e.preventDefault();
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart, isPreview]);

  const handleMouseUp = useCallback(() => {
    if (isPreview) return;
    setIsDragging(false);
  }, [isPreview]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isPreview) return;
    const target = e.target as Element;
    if (target === svgRef.current || target.tagName === 'svg') {
      if (e.touches.length === 1) {
        setIsDragging(true);
        setDragStart({
          x: e.touches[0].clientX - pan.x,
          y: e.touches[0].clientY - pan.y
        });
      }
    }
  }, [pan, isPreview]);

  const handleTouchEnd = useCallback(() => {
    if (isPreview) return;
    setIsDragging(false);
  }, [isPreview]);

  useEffect(() => {
    if (isPreview) return;
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
    if (isPreview) return;
    event.stopPropagation();
    event.preventDefault();

    if ('touches' in event) {
      setIsDragging(false);
    }

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      setShowMemberPopup(member);
      onSelectMember(member);
      return;
    }

    // Desktop positioning logic
    const container = document.querySelector('.family-tree-container') as HTMLElement;
    const svgRect = svgRef.current?.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    if (!svgRect || !containerRect) return;

    let clientX: number, clientY: number;
    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    const popupWidth = 380;
    const popupHeight = 600;
    const margin = 16;

    let popupLeft = clientX - containerRect.left;
    let popupTop = clientY - containerRect.top;

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

      // Spouse connections - only for main line ancestors (spaced out spouses)
      node.spouses.forEach((spouse) => {
        if (node.member.id < spouse.member.id && spouse.spouseType === 'main-line') {
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

    // Sibling connections
    const processedSiblingConnections = new Set<string>();
    treeNodes.forEach((node) => {
      if (node.siblings.length > 0) {
        const siblingGroup = [node, ...node.siblings];
        const sameGenSiblings = siblingGroup
          .filter(s => s.generation === node.generation && s.side === node.side)
          .sort((a, b) => a.x - b.x);

        if (sameGenSiblings.length > 1) {
          const y = sameGenSiblings[0].y + 10;

          for (let i = 0; i < sameGenSiblings.length - 1; i++) {
            const current = sameGenSiblings[i];
            const next = sameGenSiblings[i + 1];
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
          {/* Left side controls */}
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

          {/* Fullscreen button */}
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
                  stroke={node.spouseType === 'attached' ? '#FFFFFF' : 'none'}
                  strokeWidth={node.spouseType === 'attached' ? '1' : '0'}
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

      {/* Mini map toggle button */}
      {!isMobile && !showMiniMap && !isPreview && (
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
          <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.2" />
          </filter>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {generateConnections()}

          {/* Render spouses first (behind) */}
          {treeNodes.filter(node => node.spouseType === 'attached').map(node => (
            <g
              key={node.member.id}
              transform={`translate(${node.x - CARD_WIDTH / 2}, ${node.y - CARD_HEIGHT / 2})`}
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''} spouse-card`}
              onClick={(e) => handleMemberClick(node.member, e)}
              style={{
                cursor: 'pointer',
                pointerEvents: 'all',
                zIndex: 1
              }}
            >
              {/* Spouse Card Background - slightly transparent */}
              <rect
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                rx="12"
                fill={selectedMember?.id === node.member.id ? '#EEF2FF' : 'rgba(255, 255, 255, 0.9)'}
                stroke={(() => {
                  if (selectedMember?.id === node.member.id) return '#6366F1';
                  if (node.isMainLine && firstMember?.id !== node.member.id) return '#F59E0B';
                  switch (node.member.gender) {
                    case 'male': return '#3B82F6';
                    case 'female': return '#EC4899';
                    case 'other': return '#10B981';
                    default: return '#E5E7EB';
                  }
                })()}
                strokeWidth={selectedMember?.id === node.member.id ? '3' : (node.isMainLine && firstMember?.id !== node.member.id) ? '3' : '2'}
                strokeDasharray="5,5"
                filter="url(#cardShadow)"
                style={{ pointerEvents: 'all' }}
              />

              {/* Plus button */}
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

              {/* Member name - smaller for spouses */}
              <text
                x="30"
                y="22"
                textAnchor="start"
                className="member-name-first spouse-name"
                fill="#374151"
                fontSize="12"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.first_name}
              </text>
              <text
                x="30"
                y="36"
                textAnchor="start"
                className="member-name-last spouse-name"
                fill="#374151"
                fontSize="12"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {node.member.last_name}
              </text>

              {/* Birth year */}
              {node.member.birth_date && (
                <text
                  x={CARD_WIDTH / 2}
                  y="55"
                  textAnchor="middle"
                  className="member-date"
                  fill="#6B7280"
                  fontSize="10"
                  style={{ pointerEvents: 'none' }}
                >
                  Born: {new Date(node.member.birth_date).getFullYear()}
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
                    case 'male': return '#3B82F6';
                    case 'female': return '#EC4899';
                    case 'other': return '#10B981';
                    default: return '#9CA3AF';
                  }
                })()}
                fontSize="12"
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
                  r="3"
                  fill="#3B82F6"
                />
              )}
            </g>
          ))}

          {/* Render blood relatives and main line ancestors last (on top) */}
          {treeNodes.filter(node => node.isMainLine || node.spouseType === 'main-line').map(node => (
            <g
              key={node.member.id}
              transform={`translate(${node.x - CARD_WIDTH / 2}, ${node.y - CARD_HEIGHT / 2})`}
              className={`member-card ${selectedMember?.id === node.member.id ? 'selected' : ''} ${firstMember?.id === node.member.id ? 'first-member' : ''} ${node.isMainLine ? 'main-line' : ''}`}
              onClick={(e) => handleMemberClick(node.member, e)}
              style={{
                cursor: 'pointer',
                pointerEvents: 'all'
              }}
            >
              {/* Card background */}
              <rect
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                rx="12"
                fill={selectedMember?.id === node.member.id ? '#EEF2FF' : '#FFFFFF'}
                stroke={(() => {
                  if (selectedMember?.id === node.member.id) return '#6366F1';
                  switch (node.member.gender) {
                    case 'male': return '#3B82F6';
                    case 'female': return '#EC4899';
                    case 'other': return '#10B981';
                    default: return '#E5E7EB';
                  }
                })()}
                strokeWidth={selectedMember?.id === node.member.id ? '3' : (node.isMainLine && firstMember?.id !== node.member.id) ? '3' : '2'}
                filter="url(#cardShadow)"
                style={{ pointerEvents: 'all' }}
              />

              {/* Plus button */}
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
                    case 'male': return '#3B82F6';
                    case 'female': return '#EC4899';
                    case 'other': return '#10B981';
                    default: return '#9CA3AF';
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

              {/* Main line ancestor indicator */}
              {node.isMainLine && firstMember?.id !== node.member.id && (
                <g>
                  <circle
                    cx={15}
                    cy={15}
                    r="8"
                    fill="#F59E0B"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    x={15}
                    y={19}
                    textAnchor="middle"
                    fill="white"
                    fontSize="8"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    ★
                  </text>
                </g>
              )}
            </g>
          ))}
        </g>
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
        <div className="legend-item">
          <div className="legend-line" style={{ backgroundColor: '#f59e0b', height: '3px', width: '20px' }}></div>
          <span>Main Line Ancestors</span>
        </div>
        {firstMember && (
          <div className="legend-item">
            <div style={{
              width: '20px',
              height: '20px',
              backgroundColor: '#f59e0b',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '10px',
              fontWeight: 'bold'
            }}>
              1st
            </div>
            <span>First Member</span>
          </div>
        )}
      </div>

      {/* Member popup */}
      {showMemberPopup && (
        <>
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