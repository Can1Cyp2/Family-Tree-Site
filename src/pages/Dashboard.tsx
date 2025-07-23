import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import FamilyTree from '../components/FamilyTree';
import AddFamilyMemberForm from '../components/AddFamilyMemberForm';
import AddRelationForm from '../components/AddRelationForm';
import { FamilyMember, Relationship } from '../types';
import { supabase } from '../supabaseClient';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);
  const [showAddRelationForm, setShowAddRelationForm] = useState(false);
  const [selectedFamilyMember, setSelectedFamilyMember] = useState<FamilyMember | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch family members
      const { data: membersData, error: membersError } = await supabase
        .from('family_members')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at');

      if (membersError) throw membersError;

      // Fetch relationships
      const { data: relationshipsData, error: relationshipsError } = await supabase
        .from('relationships')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at');

      if (relationshipsError) throw relationshipsError;

      setFamilyMembers(membersData || []);
      setRelationships(relationshipsData || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError(error.message || 'Failed to load family data');
    } finally {
      setLoading(false);
    }
  };

  const handleMemberAdded = (newMember: FamilyMember) => {
    setFamilyMembers(prev => [...prev, newMember]);
    setShowAddMemberForm(false);
    setSelectedFamilyMember(null); // Clear selection after adding a member
  };

  const handleRelationAdded = (newMember: FamilyMember) => {
    // After adding a new member and their relation, re-fetch all data
    // to ensure the tree is updated with the new member and relationships.
    fetchData();
    setShowAddRelationForm(false);
    setSelectedFamilyMember(null); // Clear selection after adding a relation
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!user || !user.id) {
      setError('User not logged in or user ID not available.');
      console.error('Deletion failed: User not logged in or user ID not available.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this family member? This will also delete all their relationships.')) {
      return;
    }

    try {
      console.log(`Attempting to delete member ${memberId} and associated relationships for user ${user.id}`);

      // 1. Delete associated relationships
      const { error: relationshipsError } = await supabase
        .from('relationships')
        .delete()
        .or(`person1_id.eq.${memberId},person2_id.eq.${memberId}`)
        .eq('user_id', user.id);

      if (relationshipsError) {
        console.error('Error deleting relationships:', relationshipsError);
        throw relationshipsError;
      }
      console.log('Relationships deleted successfully.');

      // 2. Delete the family member
      const { error: memberError } = await supabase
        .from('family_members')
        .delete()
        .eq('id', memberId)
        .eq('user_id', user.id);

      if (memberError) {
        console.error('Error deleting member:', memberError);
        throw memberError;
      }
      console.log('Family member deleted successfully.');

      // Re-fetch all data to ensure state is synchronized with the database
      fetchData();
      console.log('Data re-fetched after deletion.');
    } catch (error: any) {
      console.error('Caught error during deletion process:', error);
      setError(error.message || 'Failed to delete family member and relationships');
    }
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading your family tree...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#1f2937', marginBottom: '1rem' }}>Your Family Tree</h1>
        
        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <div style={{ marginBottom: '2rem' }}>
          <button 
            onClick={() => {
              setShowAddMemberForm(true);
              setSelectedFamilyMember(null); // Ensure no member is selected when adding a new one
            }} 
            className="btn btn-primary"
            style={{ marginRight: '10px' }}
          >
            Add New Family Member
          </button>
          
          {selectedFamilyMember && (
            <>
              <button 
                onClick={() => setShowAddRelationForm(true)} 
                className="btn btn-secondary"
                style={{ marginRight: '10px' }}
              >
                Add Related Member to {selectedFamilyMember.first_name}
              </button>
              <button 
                onClick={() => setSelectedFamilyMember(null)} 
                className="btn btn-info"
              >
                Clear Selection
              </button>
            </>
          )}
        </div>

        {familyMembers.length === 0 ? (
          <div className="card">
            <h3>Welcome to your Family Tree!</h3>
            <p>Start by adding your first family member. You can add yourself, a parent, or any family member you'd like to begin with.</p>
            <button 
              onClick={() => setShowAddMemberForm(true)} 
              className="btn btn-primary"
            >
              Add Your First Family Member
            </button>
          </div>
        ) : (
          <div className="card">
            <FamilyTree 
              familyMembers={familyMembers}
              relationships={relationships}
              onDeleteMember={handleDeleteMember}
              onSelectMember={setSelectedFamilyMember}
              selectedMember={selectedFamilyMember}
            />
          </div>
        )}

        {familyMembers.length > 0 && (
          <div className="card">
            <h3>Family Members ({familyMembers.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {familyMembers.map(member => (
                <div key={member.id} style={{ 
                  padding: '1rem', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '8px',
                  background: '#f9fafb'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#1f2937' }}>
                    {member.first_name} {member.last_name}
                  </h4>
                  <p style={{ margin: '0', color: '#6b7280', fontSize: '0.9rem' }}>
                    Gender: {member.gender}
                  </p>
                  {member.birth_date && (
                    <p style={{ margin: '0', color: '#6b7280', fontSize: '0.9rem' }}>
                      Born: {new Date(member.birth_date).toLocaleDateString()}
                    </p>
                  )}
                  <button 
                    onClick={() => handleDeleteMember(member.id)}
                    className="btn btn-danger"
                    style={{ marginTop: '0.5rem', padding: '5px 10px', fontSize: '0.8rem' }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddMemberForm && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ 
            backgroundColor: 'white', 
            padding: '2rem', 
            borderRadius: '10px', 
            maxWidth: '500px', 
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <AddFamilyMemberForm 
              onMemberAdded={handleMemberAdded}
              onCancel={() => setShowAddMemberForm(false)}
            />
          </div>
        </div>
      )}

      {showAddRelationForm && selectedFamilyMember && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ 
            backgroundColor: 'white', 
            padding: '2rem', 
            borderRadius: '10px', 
            maxWidth: '500px', 
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <AddRelationForm 
              selectedFamilyMember={selectedFamilyMember}
              onRelationAdded={handleRelationAdded}
              onCancel={() => setShowAddRelationForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;