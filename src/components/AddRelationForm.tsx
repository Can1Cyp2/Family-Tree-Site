import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { FamilyMember, Relationship } from '../types';

interface AddRelationFormProps {
  mode: 'add_new_related' | 'add_existing_relation';
  onCancel: () => void;
  // Props for 'add_new_related' mode
  selectedFamilyMember?: FamilyMember | null;
  onRelationAdded?: (data: FamilyMember | Relationship) => void;
  // Props for 'add_existing_relation' mode
  familyMembers?: FamilyMember[];
  existingRelationships?: Relationship[];
}

const AddRelationForm: React.FC<AddRelationFormProps> = ({
  mode,
  selectedFamilyMember,
  onRelationAdded,
  onCancel,
  familyMembers = [],
  existingRelationships = [],
}) => {
  const { user } = useAuth();
  const [error, setError] = useState('');
  
  // Search states for existing relationships
  const [person1Search, setPerson1Search] = useState('');
  const [person2Search, setPerson2Search] = useState('');
  const [showPerson1Dropdown, setShowPerson1Dropdown] = useState(false);
  const [showPerson2Dropdown, setShowPerson2Dropdown] = useState(false);

  // State for 'add_new_related' mode
  const [newMemberFirstName, setNewMemberFirstName] = useState('');
  const [newMemberLastName, setNewMemberLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [newRelatedRelationshipType, setNewRelatedRelationshipType] = useState<'' | 'parent' | 'child' | 'spouse' | 'sibling'>('');

  // State for 'add_existing_relation' mode
  const [person1Id, setPerson1Id] = useState<string>(selectedFamilyMember?.id || '');
  const [person2Id, setPerson2Id] = useState<string>('');
  const [existingRelationshipType, setExistingRelationshipType] = useState<'' | 'parent' | 'child' | 'spouse' | 'sibling'>('');

  // Helper function to filter family members based on search term
  const getFilteredMembers = (searchTerm: string, excludeId?: string) => {
    if (!searchTerm.trim()) {
      return familyMembers.filter(member => !excludeId || member.id !== excludeId);
    }
    
    const searchLower = searchTerm.toLowerCase();
    return familyMembers.filter(member => {
      if (excludeId && member.id === excludeId) return false;
      
      const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
      const firstName = member.first_name.toLowerCase();
      const lastName = member.last_name.toLowerCase();
      
      return fullName.includes(searchLower) || 
             firstName.includes(searchLower) || 
             lastName.includes(searchLower);
    });
  };

  // Helper function to get display name for a member ID
  const getMemberDisplayName = (memberId: string) => {
    const member = familyMembers.find(m => m.id === memberId);
    return member ? `${member.first_name} ${member.last_name}` : '';
  };

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.searchable-dropdown')) {
        setShowPerson1Dropdown(false);
        setShowPerson2Dropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Initialize search fields when selectedFamilyMember changes
  useEffect(() => {
    if (selectedFamilyMember) {
      setPerson1Search(`${selectedFamilyMember.first_name} ${selectedFamilyMember.last_name}`);
    }
  }, [selectedFamilyMember]);

  // Auto-relationship detection and creation function
  const createAutoRelationships = async (
    newMember: FamilyMember, 
    selectedFamilyMember: FamilyMember, 
    relationshipType: string
  ) => {
    
    // 1. SIBLING RELATIONSHIPS
    if (relationshipType === 'sibling') {
      
      // Find all existing siblings of the selected family member
      const existingSiblingRelationships = existingRelationships.filter(rel =>
        (rel.person1_id === selectedFamilyMember.id || rel.person2_id === selectedFamilyMember.id) &&
        rel.relationship_type === 'sibling'
      );

      // Get the IDs of all existing siblings
      const existingSiblingIds = existingSiblingRelationships.map(rel => {
        if (rel.person1_id === selectedFamilyMember.id) {
          return rel.person2_id;
        } else {
          return rel.person1_id;
        }
      });

      // Create sibling relationships between the new member and all existing siblings
      for (const siblingId of existingSiblingIds) {
        // Add relationship from new member to existing sibling
        const { error: siblingError1 } = await supabase
          .from('relationships')
          .insert({
            user_id: user!.id,
            person1_id: newMember.id,
            person2_id: siblingId,
            relationship_type: 'sibling',
          });
        if (siblingError1) {
          console.warn('Failed to add sibling relationship:', siblingError1);
        }

        // Add reciprocal relationship from existing sibling to new member
        const { error: siblingError2 } = await supabase
          .from('relationships')
          .insert({
            user_id: user!.id,
            person1_id: siblingId,
            person2_id: newMember.id,
            relationship_type: 'sibling',
          });
        if (siblingError2) {
          console.warn('Failed to add reciprocal sibling relationship:', siblingError2);
        }
      }
    }

    // 2. SPOUSE RELATIONSHIPS - Auto-create parent relationships for existing children
    if (relationshipType === 'spouse') {
      
      // Find all children of the selected family member
      const childrenOfSelected = existingRelationships.filter(rel =>
        (rel.person1_id === selectedFamilyMember.id || rel.person2_id === selectedFamilyMember.id) &&
        rel.relationship_type === 'parent'
      );

      // For each child, create a parent relationship with the new spouse
      for (const childRel of childrenOfSelected) {
        const childId = childRel.person1_id === selectedFamilyMember.id ? childRel.person2_id : childRel.person1_id;
        
        // Add parent relationship from new spouse to child
        const { error: parentError1 } = await supabase
          .from('relationships')
          .insert({
            user_id: user!.id,
            person1_id: newMember.id,
            person2_id: childId,
            relationship_type: 'parent',
          });
        if (parentError1) {
          console.warn('Failed to add parent relationship from spouse to child:', parentError1);
        }

        // Add child relationship from child to new spouse
        const { error: childError1 } = await supabase
          .from('relationships')
          .insert({
            user_id: user!.id,
            person1_id: childId,
            person2_id: newMember.id,
            relationship_type: 'child',
          });
        if (childError1) {
          console.warn('Failed to add child relationship from child to spouse:', childError1);
        }
      }

      // Also check if the new member has existing children and create parent relationships with the selected member
      const childrenOfNewMember = existingRelationships.filter(rel =>
        (rel.person1_id === newMember.id || rel.person2_id === newMember.id) &&
        rel.relationship_type === 'parent'
      );

      for (const childRel of childrenOfNewMember) {
        const childId = childRel.person1_id === newMember.id ? childRel.person2_id : childRel.person1_id;
        
        // Add parent relationship from selected member to child
        const { error: parentError2 } = await supabase
          .from('relationships')
          .insert({
            user_id: user!.id,
            person1_id: selectedFamilyMember.id,
            person2_id: childId,
            relationship_type: 'parent',
          });
        if (parentError2) {
          console.warn('Failed to add parent relationship from selected to child:', parentError2);
        }

        // Add child relationship from child to selected member
        const { error: childError2 } = await supabase
          .from('relationships')
          .insert({
            user_id: user!.id,
            person1_id: childId,
            person2_id: selectedFamilyMember.id,
            relationship_type: 'child',
          });
        if (childError2) {
          console.warn('Failed to add child relationship from child to selected:', childError2);
        }
      }
    }

    // 3. PARENT RELATIONSHIPS - Only create the specific parent-child relationship requested
    if (relationshipType === 'parent') {
      
      // Only create the specific parent-child relationship that was requested
      // Don't automatically make the new parent a parent to all siblings
      // This prevents creating incorrect relationships
      
    }

    // 4. CHILD RELATIONSHIPS - Auto-create sibling relationships with existing children
    if (relationshipType === 'child') {
      
      // Find all existing children of the selected family member
      // Only look for relationships where selectedFamilyMember is the PARENT (person1_id)
      const existingChildren = existingRelationships.filter(rel =>
        rel.person1_id === selectedFamilyMember.id && rel.relationship_type === 'parent'
      );

      // Create sibling relationships between the new child and all existing children
      for (const childRel of existingChildren) {
        const existingChildId = childRel.person2_id; // person2_id is always the child when person1_id is the parent
        
        if (existingChildId !== newMember.id) { // Don't create self-sibling relationship
          // Add sibling relationship
          const { error: siblingError1 } = await supabase
            .from('relationships')
            .insert({
              user_id: user!.id,
              person1_id: newMember.id,
              person2_id: existingChildId,
              relationship_type: 'sibling',
            });
          if (siblingError1) {
            console.warn('Failed to add sibling relationship:', siblingError1);
          }

          // Add reciprocal sibling relationship
          const { error: siblingError2 } = await supabase
            .from('relationships')
            .insert({
              user_id: user!.id,
              person1_id: existingChildId,
              person2_id: newMember.id,
              relationship_type: 'sibling',
            });
          if (siblingError2) {
              console.warn('Failed to add reciprocal sibling relationship:', siblingError2);
          }
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!user) {
      setError('You must be logged in to add a relationship.');
      return;
    }

    if (mode === 'add_new_related') {
      if (!newMemberFirstName || !newMemberLastName || !newRelatedRelationshipType) {
        setError('Please fill in all required fields for the new member.');
        return;
      }

      try {
        // 1. Add the new family member
        const { data: newMemberData, error: newMemberError } = await supabase
          .from('family_members')
          .insert({
            user_id: user.id,
            first_name: newMemberFirstName,
            last_name: newMemberLastName,
            birth_date: birthDate || null,
            death_date: deathDate || null,
            gender: gender || null,
          })
          .select()
          .single();

        if (newMemberError) {
          throw newMemberError;
        }

        const newMember: FamilyMember = newMemberData;

        // 2. Add the relationship(s)
        if (selectedFamilyMember) {
          let person1_id: string;
          let person2_id: string;
          let relType1: 'parent' | 'child' | 'spouse' | 'sibling';
          let relType2: 'parent' | 'child' | 'spouse' | 'sibling' | null = null;

          switch (newRelatedRelationshipType) {
            case 'parent':
              person1_id = newMember.id;
              person2_id = selectedFamilyMember.id;
              relType1 = 'parent';
              relType2 = 'child';
              break;
            case 'child':
              person1_id = selectedFamilyMember.id;
              person2_id = newMember.id;
              relType1 = 'parent';
              relType2 = 'child';
              break;
            case 'spouse':
              person1_id = selectedFamilyMember.id;
              person2_id = newMember.id;
              relType1 = 'spouse';
              break;
            case 'sibling':
              person1_id = selectedFamilyMember.id;
              person2_id = newMember.id;
              relType1 = 'sibling';
              break;
            default:
              throw new Error('Invalid relationship type');
          }

          const { error: relationshipError } = await supabase
            .from('relationships')
            .insert({
              user_id: user.id,
              person1_id: person1_id,
              person2_id: person2_id,
              relationship_type: relType1,
            });

          if (relationshipError) {
            throw relationshipError;
          }

          // Add reciprocal relationship if applicable
          if (relType2) {
            const { error: reciprocalError } = await supabase
              .from('relationships')
              .insert({
                user_id: user.id,
                person1_id: person2_id,
                person2_id: person1_id,
                relationship_type: relType2,
              });
            if (reciprocalError) {
              console.warn('Failed to add reciprocal relationship:', reciprocalError);
            }
          }

          // Auto-relationship detection and creation
          await createAutoRelationships(newMember, selectedFamilyMember, newRelatedRelationshipType);
        }

        if (onRelationAdded) onRelationAdded(newMember);
        // Reset form
        setNewMemberFirstName('');
        setNewMemberLastName('');
        setBirthDate('');
        setDeathDate('');
        setGender('');
        setNewRelatedRelationshipType('');
      } catch (err: any) {
        console.error('Error adding family member and relationship:', err);
        setError(err.message || 'Failed to add family member and relationship.');
      }
    } else if (mode === 'add_existing_relation') {
      if (!person1Id || !person2Id || !existingRelationshipType) {
        setError('Please select both family members and a relationship type.');
        return;
      }

      if (person1Id === person2Id) {
        setError('Cannot create a relationship with the same person.');
        return;
      }

      // Check for existing relationship to prevent duplicates
      const relationshipExists = existingRelationships.some(rel =>
        (rel.person1_id === person1Id && rel.person2_id === person2Id && rel.relationship_type === existingRelationshipType) ||
        (rel.person1_id === person2Id && rel.person2_id === person1Id && rel.relationship_type === existingRelationshipType)
      );

      if (relationshipExists) {
        setError('This relationship already exists.');
        return;
      }

      try {
        const { data, error: supabaseError } = await supabase
          .from('relationships')
          .insert({
            user_id: user.id,
            person1_id: person1Id,
            person2_id: person2Id,
            relationship_type: existingRelationshipType,
          })
          .select()
          .single();

        if (supabaseError) {
          throw supabaseError;
        }

        // Add reciprocal relationship
        let reciprocalType: 'parent' | 'child' | 'spouse' | 'sibling' | null = null;
        switch (existingRelationshipType) {
          case 'parent':
            reciprocalType = 'child';
            break;
          case 'child':
            reciprocalType = 'parent';
            break;
          case 'spouse':
            reciprocalType = 'spouse'; // Spouse is reciprocal
            break;
          case 'sibling':
            reciprocalType = 'sibling'; // Sibling is reciprocal
            break;
        }

        if (reciprocalType) {
          const { error: reciprocalError } = await supabase
            .from('relationships')
            .insert({
              user_id: user.id,
              person1_id: person2Id,
              person2_id: person1Id,
              relationship_type: reciprocalType,
            });
          if (reciprocalError) {
            console.warn('Failed to add reciprocal relationship:', reciprocalError);
          }
        }

        if (onRelationAdded) onRelationAdded(data);
        // Reset form
        setPerson1Id('');
        setPerson2Id('');
        setExistingRelationshipType('');
      } catch (err: any) {
        console.error('Error adding existing relationship:', err);
        setError(err.message || 'Failed to add existing relationship.');
      }
    }
  };

  return (
    <div className="card" style={{ padding: '10px', margin: '0', marginBottom: '10px' }}>
      <div className="card-body" style={{ padding: '10px', marginBottom: '80px'  }}>
        
        {mode === 'add_new_related' && (
          <h5 className="card-title" style={{ fontSize: '16px', marginBottom: '15px' }}>Add New Member {selectedFamilyMember ? `to ${selectedFamilyMember.first_name} ${selectedFamilyMember.last_name}` : ''}</h5>
        )}
        {mode === 'add_existing_relation' && (
          <h5 className="card-title" style={{ fontSize: '16px', marginBottom: '15px' }}>Add Existing Relationship</h5>
        )}
        
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          {mode === 'add_new_related' && (
            <>
              <div className="mb-3" style={{ marginBottom: '10px' }}>
                <label htmlFor="newMemberFirstName" className="form-label">First Name</label>
                <input
                  type="text"
                  className="form-control"
                  id="newMemberFirstName"
                  value={newMemberFirstName}
                  onChange={(e) => setNewMemberFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="mb-3" style={{ marginBottom: '10px' }}>
                <label htmlFor="newMemberLastName" className="form-label">Last Name</label>
                <input
                  type="text"
                  className="form-control"
                  id="newMemberLastName"
                  value={newMemberLastName}
                  onChange={(e) => setNewMemberLastName(e.target.value)}
                  required
                />
              </div>
              <div className="mb-3" style={{ marginBottom: '10px' }}>
                <label htmlFor="newMemberBirthDate" className="form-label">Birth Date (Optional)</label>
                <input
                  type="date"
                  className="form-control"
                  id="newMemberBirthDate"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="mb-3" style={{ marginBottom: '10px' }}>
                <label htmlFor="newMemberDeathDate" className="form-label">Death Date (Optional)</label>
                <input
                  type="date"
                  className="form-control"
                  id="newMemberDeathDate"
                  value={deathDate}
                  onChange={(e) => setDeathDate(e.target.value)}
                />
              </div>
              <div className="mb-3" style={{ marginBottom: '10px' }}>
                <label htmlFor="newMemberGender" className="form-label">Gender (Optional)</label>
                <select
                  className="form-select"
                  id="newMemberGender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other' | '')}
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {selectedFamilyMember && (
                <div className="mb-3" style={{ marginBottom: '10px' }}>
                  <label htmlFor="newRelatedRelationshipType" className="form-label">Relationship to {selectedFamilyMember.first_name}</label>
                  <select
                    className="form-select"
                    id="newRelatedRelationshipType"
                    value={newRelatedRelationshipType}
                    onChange={(e) => setNewRelatedRelationshipType(e.target.value as '' | 'parent' | 'child' | 'spouse' | 'sibling')}
                    required
                  >
                    <option value="">Select Relationship</option>
                    <option value="parent">Parent (will be positioned above {selectedFamilyMember.first_name})</option>
                    <option value="child">Child (will be positioned below {selectedFamilyMember.first_name})</option>
                    <option value="spouse">Spouse (will be positioned next to {selectedFamilyMember.first_name})</option>
                    <option value="sibling">Sibling (will be positioned at the same level as {selectedFamilyMember.first_name})</option>
                  </select>
                </div>
              )}
            </>
          )}

          {mode === 'add_existing_relation' && (
            <>
              <div className="mb-3" style={{ marginBottom: '10px' }}>
                <label htmlFor="person1" className="form-label">Family Member 1</label>
                {selectedFamilyMember ? (
                  <input
                    type="text"
                    className="form-control"
                    id="person1"
                    value={`${selectedFamilyMember.first_name} ${selectedFamilyMember.last_name}`}
                    disabled
                  />
                ) : (
                  <div style={{ position: 'relative' }} className="searchable-dropdown">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search for a family member..."
                      value={person1Search}
                      onChange={(e) => {
                        setPerson1Search(e.target.value);
                        setShowPerson1Dropdown(true);
                        if (!e.target.value.trim()) {
                          setPerson1Id('');
                        }
                      }}
                      onFocus={() => setShowPerson1Dropdown(true)}
                      required
                    />
                    {showPerson1Dropdown && (
                      <div 
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: 'white',
                          border: '1px solid #ced4da',
                          borderRadius: '0.375rem',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 1000,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                      >
                        {getFilteredMembers(person1Search, person2Id).map((member) => (
                          <div
                            key={member.id}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f8f9fa',
                              backgroundColor: person1Id === member.id ? '#e9ecef' : 'white'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f8f9fa';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = person1Id === member.id ? '#e9ecef' : 'white';
                            }}
                            onClick={() => {
                              setPerson1Id(member.id);
                              setPerson1Search(`${member.first_name} ${member.last_name}`);
                              setShowPerson1Dropdown(false);
                            }}
                          >
                            {member.first_name} {member.last_name}
                          </div>
                        ))}
                        {getFilteredMembers(person1Search, person2Id).length === 0 && (
                          <div style={{ padding: '8px 12px', color: '#6c757d', fontStyle: 'italic' }}>
                            No members found
                          </div>
                        )}
                      </div>
                    )}
                    {person1Id && (
                      <div style={{ marginTop: '4px', fontSize: '12px', color: '#6c757d' }}>
                        Selected: {getMemberDisplayName(person1Id)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mb-3" style={{ marginBottom: '10px' }}>
                <label htmlFor="person2" className="form-label">Family Member 2</label>
                <div style={{ position: 'relative' }} className="searchable-dropdown">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search for a family member..."
                    value={person2Search}
                    onChange={(e) => {
                      setPerson2Search(e.target.value);
                      setShowPerson2Dropdown(true);
                      if (!e.target.value.trim()) {
                        setPerson2Id('');
                      }
                    }}
                    onFocus={() => setShowPerson2Dropdown(true)}
                    required
                  />
                  {showPerson2Dropdown && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        border: '1px solid #ced4da',
                        borderRadius: '0.375rem',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    >
                      {getFilteredMembers(person2Search, person1Id).map((member) => (
                        <div
                          key={member.id}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f8f9fa',
                            backgroundColor: person2Id === member.id ? '#e9ecef' : 'white'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f8f9fa';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = person2Id === member.id ? '#e9ecef' : 'white';
                          }}
                          onClick={() => {
                            setPerson2Id(member.id);
                            setPerson2Search(`${member.first_name} ${member.last_name}`);
                            setShowPerson2Dropdown(false);
                          }}
                        >
                          {member.first_name} {member.last_name}
                        </div>
                      ))}
                      {getFilteredMembers(person2Search, person1Id).length === 0 && (
                        <div style={{ padding: '8px 12px', color: '#6c757d', fontStyle: 'italic' }}>
                          No members found
                        </div>
                      )}
                    </div>
                  )}
                  {person2Id && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#6c757d' }}>
                      Selected: {getMemberDisplayName(person2Id)}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-3" style={{ marginBottom: '10px' }}>
                <label htmlFor="existingRelationshipType" className="form-label">Relationship Type</label>
                <select
                  className="form-select"
                  id="existingRelationshipType"
                  value={existingRelationshipType}
                  onChange={(e) => setExistingRelationshipType(e.target.value as '' | 'parent' | 'child' | 'spouse' | 'sibling')}
                  required
                >
                  <option value="">Select type</option>
                  <option value="parent">Parent (person 1 is parent of person 2)</option>
                  <option value="child">Child (person 1 is child of person 2)</option>
                  <option value="spouse">Spouse (person 1 and person 2 are spouses)</option>
                  <option value="sibling">Sibling (person 1 and person 2 are siblings)</option>
                </select>
              </div>
            </>
          )}

          <div className="d-flex justify-content-end" style={{ marginTop: '15px' }}>
            <button type="button" className="btn btn-secondary me-2" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {mode === 'add_new_related' ? 'Add Member & Relate' : 'Add Relationship'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddRelationForm;