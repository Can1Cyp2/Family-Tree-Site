import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FamilyMember } from '../types';
import { supabase } from '../supabaseClient';

interface AddFamilyMemberFormProps {
  onMemberAdded: (member: FamilyMember) => void;
  onCancel: () => void;
}

const AddFamilyMemberForm: React.FC<AddFamilyMemberFormProps> = ({
  onMemberAdded,
  onCancel
}) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    deathDate: '',
    gender: 'male' as 'male' | 'female' | 'other',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to add family members');
      return;
    }

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('First name and last name are required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const memberData = {
        user_id: user.id,
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        birth_date: formData.birthDate || null,
        death_date: formData.deathDate || null,
        gender: formData.gender,
        notes: formData.notes.trim() || null
      };

      const { data, error: insertError } = await supabase
        .from('family_members')
        .insert([memberData])
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        onMemberAdded(data);
        setFormData({
          firstName: '',
          lastName: '',
          birthDate: '',
          deathDate: '',
          gender: 'male',
          notes: ''
        });
      }
    } catch (error: any) {
      console.error('Error adding family member:', error);
      setError(error.message || 'Failed to add family member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Add Family Member</h2>
      
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label htmlFor="firstName">First Name *</label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              className="form-control"
              value={formData.firstName}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="lastName">Last Name *</label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              className="form-control"
              value={formData.lastName}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="gender">Gender</label>
          <select
            id="gender"
            name="gender"
            className="form-control"
            value={formData.gender}
            onChange={handleInputChange}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label htmlFor="birthDate">Birth Date</label>
            <input
              id="birthDate"
              name="birthDate"
              type="date"
              className="form-control"
              value={formData.birthDate}
              onChange={handleInputChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="deathDate">Death Date (if applicable)</label>
            <input
              id="deathDate"
              name="deathDate"
              type="date"
              className="form-control"
              value={formData.deathDate}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            className="form-control"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            placeholder="Additional information about this family member..."
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Adding...' : 'Add Family Member'}
          </button>
          
          <button 
            type="button" 
            onClick={onCancel}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddFamilyMemberForm;