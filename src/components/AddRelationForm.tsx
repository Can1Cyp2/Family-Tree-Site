import React, { useState } from 'react';
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

  // State for 'add_new_related' mode
  const [newMemberFirstName, setNewMemberFirstName] = useState('');
  const [newMemberLastName, setNewMemberLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [newRelatedRelationshipType, setNewRelatedRelationshipType] = useState<'' | 'parent' | 'child' | 'spouse' | 'sibling'>('');

  // State for 'add_existing_relation' mode
  const [person1Id, setPerson1Id] = useState<string>('');
  const [person2Id, setPerson2Id] = useState<string>('');
  const [existingRelationshipType, setExistingRelationshipType] = useState<'' | 'parent' | 'child' | 'spouse' | 'sibling'>('');

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
        }

        if (onRelationAdded) onRelationAdded(newMember);
        // Reset form
        setNewMemberFirstName('');
        setNewMemberLastName('');
        setBirthDate('');
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
    <div className="card">
      <div className="card-body">
        {mode === 'add_new_related' && (
          <h5 className="card-title">Add New Member {selectedFamilyMember ? `to ${selectedFamilyMember.first_name} ${selectedFamilyMember.last_name}` : ''}</h5>
        )}
        {mode === 'add_existing_relation' && (
          <h5 className="card-title">Add Existing Relationship</h5>
        )}
        
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          {mode === 'add_new_related' && (
            <>
              <div className="mb-3">
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
              <div className="mb-3">
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
              <div className="mb-3">
                <label htmlFor="newMemberBirthDate" className="form-label">Birth Date (Optional)</label>
                <input
                  type="date"
                  className="form-control"
                  id="newMemberBirthDate"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="mb-3">
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
                <div className="mb-3">
                  <label htmlFor="newRelatedRelationshipType" className="form-label">Relationship to {selectedFamilyMember.first_name}</label>
                  <select
                    className="form-select"
                    id="newRelatedRelationshipType"
                    value={newRelatedRelationshipType}
                    onChange={(e) => setNewRelatedRelationshipType(e.target.value as '' | 'parent' | 'child' | 'spouse' | 'sibling')}
                    required
                  >
                    <option value="">Select Relationship</option>
                    <option value="parent">Parent</option>
                    <option value="child">Child</option>
                    <option value="spouse">Spouse</option>
                    <option value="sibling">Sibling</option>
                  </select>
                </div>
              )}
            </>
          )}

          {mode === 'add_existing_relation' && (
            <>
              <div className="mb-3">
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
                  <select
                    className="form-select"
                    id="person1"
                    value={person1Id}
                    onChange={(e) => setPerson1Id(e.target.value)}
                    required
                  >
                    <option value="">Select a member</option>
                    {familyMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mb-3">
                <label htmlFor="person2" className="form-label">Family Member 2</label>
                <select
                  className="form-select"
                  id="person2"
                  value={person2Id}
                  onChange={(e) => setPerson2Id(e.target.value)}
                  required
                >
                  <option value="">Select a member</option>
                  {familyMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.first_name} {member.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label htmlFor="existingRelationshipType" className="form-label">Relationship Type</label>
                <select
                  className="form-select"
                  id="existingRelationshipType"
                  value={existingRelationshipType}
                  onChange={(e) => setExistingRelationshipType(e.target.value as '' | 'parent' | 'child' | 'spouse' | 'sibling')}
                  required
                >
                  <option value="">Select type</option>
                  <option value="parent">Parent</option>
                  <option value="child">Child</option>
                  <option value="spouse">Spouse</option>
                  <option value="sibling">Sibling</option>
                </select>
              </div>
            </>
          )}

          <div className="d-flex justify-content-end">
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