import React, { useMemo, useState } from 'react';
import { FamilyMember, Relationship, FamilyNode } from '../types';

interface FamilyTreeProps {
  familyMembers: FamilyMember[];
  relationships: Relationship[];
  onDeleteMember: (memberId: string) => void;
  onSelectMember: (member: FamilyMember) => void;
  selectedMember: FamilyMember | null;
  onDeleteRelationship: (relationshipId: string) => void;
}

const FamilyTree: React.FC<FamilyTreeProps> = ({
  familyMembers,
  relationships,
  onDeleteMember,
  onSelectMember,
  selectedMember: propSelectedMember,
  onDeleteRelationship
}) => {
  const [selectedMember, setSelectedMember] = useState<string | null>(propSelectedMember?.id || null);
  const [focusedMember, setFocusedMember] = useState<string | null>(null);

  // Build relationship maps
  const relationshipMap = useMemo(() => {
    const map = new Map<string, {
      parents: { member: FamilyMember; relationship: Relationship }[];
      children: { member: FamilyMember; relationship: Relationship }[];
      spouses: { member: FamilyMember; relationship: Relationship }[];
      siblings: { member: FamilyMember; relationship: Relationship }[];
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
            if (!visited.has(child.member.id)) {
              queue.push({ member: child.member, generation: generation + 1 });
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

      {propSelectedMember && (
        <div className="card mt-4">
          <div className="card-body">
            <h5 className="card-title">Direct Relationships of {propSelectedMember.first_name} {propSelectedMember.last_name}</h5>
            {
              (() => {
                const relations = relationshipMap.get(propSelectedMember.id);
                if (!relations) {
                  return <p>No direct relationships found.</p>;
                }

                return (
                  <div>
                    <h6>Parents:</h6>
                    {relations.parents.length > 0 ? (
                      <ul>
                        {relations.parents.map(({ member: p, relationship: rel }) => (
                          <li key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span onClick={() => onSelectMember(p)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{p.first_name} {p.last_name}</span>
                            <button onClick={() => onDeleteRelationship(rel.id)} className="btn btn-sm btn-danger" style={{ marginLeft: '10px' }}>Delete</button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>None</p>
                    )}

                    <h6>Spouses:</h6>
                    {relations.spouses.length > 0 ? (
                      <ul>
                        {relations.spouses.map(({ member: s, relationship: rel }) => (
                          <li key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span onClick={() => onSelectMember(s)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{s.first_name} {s.last_name}</span>
                            <button onClick={() => onDeleteRelationship(rel.id)} className="btn btn-sm btn-danger" style={{ marginLeft: '10px' }}>Delete</button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>None</p>
                    )}

                    <h6>Children:</h6>
                    {relations.children.length > 0 ? (
                      <ul>
                        {relations.children.map(({ member: c, relationship: rel }) => (
                          <li key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span onClick={() => onSelectMember(c)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{c.first_name} {c.last_name}</span>
                            <button onClick={() => onDeleteRelationship(rel.id)} className="btn btn-sm btn-danger" style={{ marginLeft: '10px' }}>Delete</button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>None</p>
                    )}

                    <h6>Siblings:</h6>
                    {relations.siblings.length > 0 ? (
                      <ul style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '1rem' }}>
                        {relations.siblings.map(({ member: s, relationship: rel }) => (
                          <li key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span onClick={() => onSelectMember(s)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{s.first_name} {s.last_name}</span>
                            <button onClick={() => onDeleteRelationship(rel.id)} className="btn btn-sm btn-danger" style={{ marginLeft: '10px' }}>Delete</button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>None</p>
                    )}
                  </div>
                );
              })()
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyTree;