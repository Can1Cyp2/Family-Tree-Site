import React, { useMemo, useState } from 'react';
import { FamilyMember, Relationship, FamilyNode } from '../types';

interface FamilyTreeProps {
  familyMembers: FamilyMember[];
  relationships: Relationship[];
  onDeleteMember: (memberId: string) => void;
  onSelectMember: (member: FamilyMember) => void;
}

const FamilyTree: React.FC<FamilyTreeProps> = ({
  familyMembers,
  relationships,
  onDeleteMember,
  onSelectMember
}) => {
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [focusedMember, setFocusedMember] = useState<string | null>(null);

  // Build relationship maps
  const relationshipMap = useMemo(() => {
    const map = new Map<string, {
      parents: FamilyMember[];
      children: FamilyMember[];
      spouses: FamilyMember[];
      siblings: FamilyMember[];
    }>();

    // Initialize all members
    familyMembers.forEach(member => {
      map.set(member.id, {
        parents: [],
        children: [],
        spouses: [],
        siblings: []
      });
    });

    // Build relationships
    relationships.forEach(rel => {
      const person1 = familyMembers.find(m => m.id === rel.person1_id);
      const person2 = familyMembers.find(m => m.id === rel.person2_id);
      
      if (!person1 || !person2) return;

      const person1Relations = map.get(rel.person1_id)!;
      const person2Relations = map.get(rel.person2_id)!;

      switch (rel.relationship_type) {
        case 'parent':
          if (!person1Relations.children.find(c => c.id === person2.id)) {
            person1Relations.children.push(person2);
          }
          if (!person2Relations.parents.find(p => p.id === person1.id)) {
            person2Relations.parents.push(person1);
          }
          break;
        case 'child':
          if (!person1Relations.parents.find(p => p.id === person2.id)) {
            person1Relations.parents.push(person2);
          }
          if (!person2Relations.children.find(c => c.id === person1.id)) {
            person2Relations.children.push(person1);
          }
          break;
        case 'spouse':
          if (!person1Relations.spouses.find(s => s.id === person2.id)) {
            person1Relations.spouses.push(person2);
          }
          break;
        case 'sibling':
          if (!person1Relations.siblings.find(s => s.id === person2.id)) {
            person1Relations.siblings.push(person2);
          }
          break;
      }
    });

    return map;
  }, [familyMembers, relationships]);

  // Build tree structure with generations
  const treeStructure = useMemo(() => {
    if (familyMembers.length === 0) return [];

    // Find root members (those without parents or start from focused member)
    let rootMembers: FamilyMember[];
    
    if (focusedMember) {
      const member = familyMembers.find(m => m.id === focusedMember);
      rootMembers = member ? [member] : [];
    } else {
      rootMembers = familyMembers.filter(member => {
        const relations = relationshipMap.get(member.id);
        return !relations || relations.parents.length === 0;
      });
    }

    if (rootMembers.length === 0) {
      rootMembers = [familyMembers[0]]; // Fallback to first member
    }

    const buildGenerations = (startMember: FamilyMember, visited = new Set<string>()) => {
      const generations: FamilyMember[][] = [];
      const queue: { member: FamilyMember; generation: number }[] = [{ member: startMember, generation: 0 }];
      
      while (queue.length > 0) {
        const { member, generation } = queue.shift()!;
        
        if (visited.has(member.id)) continue;
        visited.add(member.id);

        // Ensure generation array exists
        while (generations.length <= generation) {
          generations.push([]);
        }

        // Add member to generation
        if (!generations[generation].find(m => m.id === member.id)) {
          generations[generation].push(member);
        }

        // Add children to queue for next generation
        const relations = relationshipMap.get(member.id);
        if (relations) {
          relations.children.forEach(child => {
            if (!visited.has(child.id)) {
              queue.push({ member: child, generation: generation + 1 });
            }
          });
        }
      }
      return generations;
    };

    // Build generations for each root member and combine them
    const allGenerations: FamilyMember[][] = [];
    rootMembers.forEach(root => {
      const memberGenerations = buildGenerations(root);
      memberGenerations.forEach((gen, genIndex) => {
        if (!allGenerations[genIndex]) {
          allGenerations[genIndex] = [];
        }
        gen.forEach(member => {
          if (!allGenerations[genIndex].find(m => m.id === member.id)) {
            allGenerations[genIndex].push(member);
          }
        });
      });
    });

    return allGenerations;
  }, [familyMembers, relationships, focusedMember, relationshipMap]);

  const handleMemberClick = (member: FamilyMember) => {
    setSelectedMember(member.id === selectedMember ? null : member.id);
    onSelectMember(member);
  };

  const handleFocusClick = (memberId: string) => {
    setFocusedMember(memberId === focusedMember ? null : memberId);
  };

  return (
    <div className="family-tree-container">
      <h2>Family Tree</h2>
      {familyMembers.length === 0 ? (
        <p>No family members added yet. Add some to see the tree!</p>
      ) : (
        <div className="tree-display">
          {treeStructure.map((generation, genIndex) => (
            <div key={genIndex} className="generation">
              <h3>Generation {genIndex + 1}</h3>
              <div className="members-row">
                {generation.map(member => (
                  <div 
                    key={member.id} 
                    className={`member-card ${focusedMember === member.id ? 'focused' : ''}`}
                    onClick={() => handleMemberClick(member)}
                  >
                    <h4>{member.first_name} {member.last_name}</h4>
                    <p>Gender: {member.gender}</p>
                    {member.birth_date && <p>Born: {member.birth_date}</p>}
                    {member.death_date && <p>Died: {member.death_date}</p>}
                    {selectedMember === member.id && (
                      <div className="member-actions">
                        <button onClick={() => handleFocusClick(member.id)} className="btn btn-sm btn-info">
                          {focusedMember === member.id ? 'Unfocus' : 'Focus Tree'}
                        </button>
                        <button onClick={() => onDeleteMember(member.id)} className="btn btn-sm btn-danger">
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FamilyTree;