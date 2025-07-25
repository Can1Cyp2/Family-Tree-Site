import React, { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { FamilyMember, Relationship } from '../types';
import '../assets/FamilyTree.css';

interface D3FamilyTreeProps {
  familyMembers: FamilyMember[];
  relationships: Relationship[];
  onSelectMember: (member: FamilyMember) => void;
  selectedMember: FamilyMember | null;
}

interface D3Node {
  id: string;
  partners: FamilyMember[];
  children: D3Node[];
  x?: number;
  y?: number;
  parent?: D3Node;
}

const D3FamilyTree: React.FC<D3FamilyTreeProps> = ({
  familyMembers,
  relationships,
  onSelectMember,
  selectedMember
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Build D3 hierarchical data structure
  const treeData = useMemo(() => {
    // Helper to get a unique key for a couple
    const coupleKey = (ids: string[]) => ids.sort().join('-');
    
    // Find all spouse pairs
    const spousePairs = new Set<string>();
    relationships.forEach(rel => {
      if (rel.relationship_type === 'spouse') {
        spousePairs.add(coupleKey([rel.person1_id, rel.person2_id]));
      }
    });

    // Build couple nodes
    const memberMap = new Map(familyMembers.map(m => [m.id, m]));
    const coupleNodeMap = new Map<string, D3Node>();
    const usedMembers = new Set<string>();

    // Create couple nodes
    spousePairs.forEach(key => {
      const [id1, id2] = key.split('-');
      if (memberMap.has(id1) && memberMap.has(id2)) {
        coupleNodeMap.set(key, {
          id: key,
          partners: [memberMap.get(id1)!, memberMap.get(id2)!],
          children: []
        });
        usedMembers.add(id1);
        usedMembers.add(id2);
      }
    });

    // Create single nodes for unpaired members
    familyMembers.forEach(member => {
      if (!usedMembers.has(member.id)) {
        const key = coupleKey([member.id]);
        coupleNodeMap.set(key, {
          id: key,
          partners: [member],
          children: []
        });
      }
    });

    // Build parent-child relationships
    relationships.forEach(rel => {
      if (rel.relationship_type === 'parent') {
        const parent = memberMap.get(rel.person1_id);
        const child = memberMap.get(rel.person2_id);
        if (!parent || !child) return;

        // Find parent couple node
        let parentNode: D3Node | undefined;
        Array.from(coupleNodeMap.values()).forEach(node => {
          if (node.partners.some((p: FamilyMember) => p.id === parent.id)) {
            parentNode = node;
          }
        });

        // Find child couple node
        let childNode: D3Node | undefined;
        Array.from(coupleNodeMap.values()).forEach(node => {
          if (node.partners.some((p: FamilyMember) => p.id === child.id)) {
            childNode = node;
          }
        });

        if (parentNode && childNode && parentNode !== childNode) {
          parentNode.children.push(childNode);
        }
      }
    });

    // Find root nodes (those with no parents)
    const allChildren = new Set<string>();
    coupleNodeMap.forEach(node => {
      node.children.forEach(child => {
        allChildren.add(child.id);
      });
    });

    const roots: D3Node[] = [];
    coupleNodeMap.forEach(node => {
      if (!allChildren.has(node.id)) {
        roots.push(node);
      }
    });

    return roots.length > 0 ? roots[0] : Array.from(coupleNodeMap.values())[0];
  }, [familyMembers, relationships]);

  useEffect(() => {
    if (!svgRef.current || !treeData) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);
    const width = 800;
    const height = 600;

    // Set up the tree layout
    const treeLayout = d3.tree<D3Node>()
      .size([width - 100, height - 100])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.2));

    // Create the hierarchy
    const root = d3.hierarchy(treeData);
    treeLayout(root);

    // Set up zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Create a container for the tree
    const container = svg.append('g')
      .attr('transform', 'translate(50, 50)');

    // Draw links between nodes
    const links = container.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', (d: any) => {
        const linkGen = d3.linkHorizontal()
          .x((d: any) => d.x)
          .y((d: any) => d.y);
        return linkGen(d);
      })
      .attr('fill', 'none')
      .attr('stroke', '#4F46E5')
      .attr('stroke-width', 2);

    // Create node groups
    const nodes = container.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Draw couple cards
    nodes.each(function(d) {
      const nodeGroup = d3.select(this);
      const nodeData = d.data as D3Node;
      
      // Draw cards for each partner
      nodeData.partners.forEach((partner, index) => {
        const cardGroup = nodeGroup.append('g')
          .attr('transform', `translate(${index * 200 - (nodeData.partners.length - 1) * 100}, -60)`);

        // Card background
        cardGroup.append('rect')
          .attr('width', 180)
          .attr('height', 120)
          .attr('rx', 12)
          .attr('fill', selectedMember?.id === partner.id ? '#EEF2FF' : '#FFFFFF')
          .attr('stroke', selectedMember?.id === partner.id ? '#6366F1' : '#E5E7EB')
          .attr('stroke-width', selectedMember?.id === partner.id ? 3 : 1)
          .style('cursor', 'pointer')
          .on('click', () => onSelectMember(partner));

        // Partner name
        cardGroup.append('text')
          .attr('x', 90)
          .attr('y', 40)
          .attr('text-anchor', 'middle')
          .attr('font-size', 16)
          .attr('font-weight', 600)
          .attr('fill', '#1F2937')
          .text(partner.first_name);

        // Partner last name
        cardGroup.append('text')
          .attr('x', 90)
          .attr('y', 60)
          .attr('text-anchor', 'middle')
          .attr('font-size', 14)
          .attr('fill', '#6B7280')
          .text(partner.last_name);

        // Gender
        cardGroup.append('text')
          .attr('x', 90)
          .attr('y', 110)
          .attr('text-anchor', 'middle')
          .attr('font-size', 12)
          .attr('fill', '#9CA3AF')
          .text(partner.gender);
      });

      // Draw line between partners if it's a couple
      if (nodeData.partners.length === 2) {
        nodeGroup.append('line')
          .attr('x1', -100)
          .attr('y1', 0)
          .attr('x2', 100)
          .attr('y2', 0)
          .attr('stroke', '#E11D48')
          .attr('stroke-width', 3);
      }
    });

  }, [treeData, selectedMember, onSelectMember]);

  return (
    <div className="family-tree-container">
      <svg
        ref={svgRef}
        width="100%"
        height="100vh"
        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}
      />
    </div>
  );
};

export default D3FamilyTree; 