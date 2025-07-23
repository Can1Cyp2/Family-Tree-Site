import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { FamilyMember, Relationship } from '../types';

interface AddRelationFormProps {
  selectedFamilyMember: FamilyMember | null;
  onRelationAdded: (newMember: FamilyMember) => void;
  onCancel: () => void;
}

const AddRelationForm: React.FC<AddRelationFormProps> = ({
  selectedFamilyMember,
  onRelationAdded,
  onCancel,
}) => {
  const { user } = useAuth();
  const [newMemberFirstName, setNewMemberFirstName] = useState('');
  const [newMemberLastName, setNewMemberLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [relationshipType, setRelationshipType] = useState<'' | 'parent' | 'child' | 'spouse' | 'sibling'>('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!user) {
      setError('You must be logged in to add a relationship.');
      return;
    }

    if (!newMemberFirstName || !newMemberLastName || !relationshipType) {
      setError('Please fill in all required fields.');
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

        switch (relationshipType) {
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
            // For siblings, we need to find a common parent.
            // This is a simplified approach and might need more complex logic
            // if parent information is not readily available or if there are half-siblings.
            // For now, we'll just create a sibling relationship directly.
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

      onRelationAdded(newMember); // Pass the newly added member to refresh the tree
      // Reset form
      setNewMemberFirstName('');
      setNewMemberLastName('');
      setBirthDate('');
      setGender('');
      setRelationshipType('');
    } catch (err: any) {
      console.error('Error adding family member and relationship:', err);
      setError(err.message || 'Failed to add family member and relationship.');
    }
  };

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">Add New Member {selectedFamilyMember ? `to ${selectedFamilyMember.first_name} ${selectedFamilyMember.last_name}` : ''}</h5>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
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
              <label htmlFor="relationshipType" className="form-label">Relationship to {selectedFamilyMember.first_name}</label>
              <select
                className="form-select"
                id="relationshipType"
                value={relationshipType}
                onChange={(e) => setRelationshipType(e.target.value as '' | 'parent' | 'child' | 'spouse' | 'sibling')}
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

          <div className="d-flex justify-content-end">
            <button type="button" className="btn btn-secondary me-2" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Member & Relate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddRelationForm;