import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import FamilyTree from '../components/FamilyTree';
import FamilyTreeModal from '../components/FamilyTreeModal'; // Import the modal
import AddFamilyMemberForm from '../components/AddFamilyMemberForm';
import AddRelationForm from '../components/AddRelationForm';
import EditMemberForm from '../components/EditMemberForm';
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
  const [showAddRelationFormMode, setShowAddRelationFormMode] = useState<'none' | 'add_new_related' | 'add_existing_relation'>('none');
  const [showEditMemberForm, setShowEditMemberForm] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<FamilyMember | null>(null);
  const [selectedFamilyMember, setSelectedFamilyMember] = useState<FamilyMember | null>(null);
  const [isFamilyTreeFullscreen, setIsFamilyTreeFullscreen] = useState(false);

  // Get the first member created (member with earliest created_at timestamp)
  const firstMember = familyMembers.length > 0 ? familyMembers[0] : null;

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

  const handleRelationAdded = (data: FamilyMember | Relationship) => {
    // After adding a new member/relation, re-fetch all data
    fetchData();
    setShowAddRelationFormMode('none');
    setSelectedFamilyMember(null); // Clear selection after adding a relation
  };

  const handleEditMember = (member: FamilyMember) => {
    setMemberToEdit(member);
    setShowEditMemberForm(true);
  };

  const handleMemberUpdated = (updatedMember: FamilyMember) => {
    setFamilyMembers(prev => prev.map(member => 
      member.id === updatedMember.id ? updatedMember : member
    ));
    setShowEditMemberForm(false);
    setMemberToEdit(null);
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
      // First, delete all relationships involving this member
      const { error: relationshipsError } = await supabase
        .from('relationships')
        .delete()
        .or(`person1_id.eq.${memberId},person2_id.eq.${memberId}`);

      if (relationshipsError) {
        console.error('Error deleting relationships:', relationshipsError);
        setError('Failed to delete relationships');
        return;
      }

      // Then delete the family member
      const { error: memberError } = await supabase
        .from('family_members')
        .delete()
        .eq('id', memberId)
        .eq('user_id', user.id);

      if (memberError) {
        console.error('Error deleting family member:', memberError);
        setError('Failed to delete family member');
        return;
      }

      // Update local state
      setFamilyMembers(prev => prev.filter(member => member.id !== memberId));
      setRelationships(prev => prev.filter(rel => 
        rel.person1_id !== memberId && rel.person2_id !== memberId
      ));

      // Clear selection if the deleted member was selected
      if (selectedFamilyMember?.id === memberId) {
        setSelectedFamilyMember(null);
      }

      // Close all modals when a member is deleted
      setShowAddMemberForm(false);
      setShowAddRelationFormMode('none');
      setShowEditMemberForm(false);
      setMemberToEdit(null);

      console.log('Family member and relationships deleted successfully');
    } catch (error: any) {
      console.error('Error deleting family member:', error);
      setError(error.message || 'Failed to delete family member');
    }
  };

  const handleDeleteRelationship = async (relationshipId: string) => {
    if (!user || !user.id) {
      setError('User not logged in or user ID not available.');
      console.error('Deletion failed: User not logged in or user ID not available.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this relationship?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('relationships')
        .delete()
        .eq('id', relationshipId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting relationship:', error);
        setError('Failed to delete relationship');
        return;
      }

      // Update local state
      setRelationships(prev => prev.filter(rel => rel.id !== relationshipId));
      console.log('Relationship deleted successfully');
    } catch (error: any) {
      console.error('Error deleting relationship:', error);
      setError(error.message || 'Failed to delete relationship');
    }
  };

  // Handle closing fullscreen modal
  const handleCloseFullscreen = () => {
    setIsFamilyTreeFullscreen(false);
    // Optionally clear selection when exiting fullscreen
    // setSelectedFamilyMember(null);
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading your family tree...</div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Fullscreen Modal */}
      {isFamilyTreeFullscreen && (
        <FamilyTreeModal
          familyMembers={familyMembers}
          relationships={relationships}
          onDeleteMember={handleDeleteMember}
          onSelectMember={setSelectedFamilyMember}
          selectedMember={selectedFamilyMember}
          onDeleteRelationship={handleDeleteRelationship}
          onAddMember={() => setShowAddMemberForm(true)}
          onAddRelatedMember={(member) => {
            setSelectedFamilyMember(member);
            setShowAddRelationFormMode('add_new_related');
          }}
          onAddExistingRelationship={(member) => {
            setSelectedFamilyMember(member);
            setShowAddRelationFormMode('add_existing_relation');
          }}
          onEditMember={handleEditMember}
          onClose={handleCloseFullscreen}
          firstMember={firstMember}
          isFullscreen={true}
        />
      )}

      {/* Add Relation Form Modal */}
      {showAddRelationFormMode !== 'none' && (
        <div 
          style={{
            position: 'fixed',
            top: '80px',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '20px',
            zIndex: 1001 // Higher than fullscreen modal
          }}
          onClick={() => setShowAddRelationFormMode('none')}
        >
          <div 
            style={{
              background: 'white',
              color: 'black',
              padding: '20px',
              border: '2px solid blue',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: 'calc(80vh - 100px)',
              overflowY: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ color: 'blue', margin: 0, fontSize: '18px' }}>
                {showAddRelationFormMode === 'add_new_related' ? 'Add New Member' : 'Add Existing Relationship'}
                {selectedFamilyMember && ` to ${selectedFamilyMember.first_name}`}
              </h3>
              <button 
                onClick={() => setShowAddRelationFormMode('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '5px'
                }}
              >
                ×
              </button>
            </div>
            
            <AddRelationForm
              mode={showAddRelationFormMode}
              selectedFamilyMember={selectedFamilyMember}
              familyMembers={familyMembers}
              existingRelationships={relationships}
              onRelationAdded={handleRelationAdded}
              onCancel={() => setShowAddRelationFormMode('none')}
            />
          </div>
        </div>
      )}

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
              setSelectedFamilyMember(null);
            }}
            className="btn btn-primary"
            style={{ marginRight: '10px' }}
          >
            Add New Family Member
          </button>
          <button
            onClick={() => setIsFamilyTreeFullscreen(true)}
            className="btn btn-secondary"
            style={{ marginRight: '10px' }}
          >
            Fullscreen Tree
          </button>

          {selectedFamilyMember && (
            <>
              <button
                onClick={() => {
                  setShowAddRelationFormMode('add_new_related');
                }}
                className="btn btn-secondary"
                style={{ marginRight: '10px' }}
              >
                Add Related Member to {selectedFamilyMember.first_name}
              </button>
              <button
                onClick={() => {
                  setShowAddRelationFormMode('add_existing_relation');
                }}
                className="btn btn-secondary"
                style={{ marginRight: '10px' }}
              >
                Add Existing Relationship to {selectedFamilyMember.first_name}
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
          <FamilyTree
            familyMembers={familyMembers}
            relationships={relationships}
            onDeleteMember={handleDeleteMember}
            onSelectMember={setSelectedFamilyMember}
            selectedMember={selectedFamilyMember}
            onDeleteRelationship={handleDeleteRelationship}
            onAddMember={() => setShowAddMemberForm(true)}
            onAddRelatedMember={(member) => {
              setSelectedFamilyMember(member);
              setShowAddRelationFormMode('add_new_related');
            }}
            onAddExistingRelationship={(member) => {
              setSelectedFamilyMember(member);
              setShowAddRelationFormMode('add_existing_relation');
            }}
            onEditMember={handleEditMember}
            onClosePopup={() => setSelectedFamilyMember(null)}
            firstMember={firstMember}
          />
        )}

        {familyMembers.length > 0 && (
          <div className="card">
            <h3>Family Members ({familyMembers.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {familyMembers.map((member) => (
                <div key={member.id} className="member-card">
                  <h4>{member.first_name} {member.last_name}</h4>
                  <p><strong>Gender:</strong> {member.gender}</p>
                  {member.birth_date && (
                    <p><strong>Birth Date:</strong> {new Date(member.birth_date).toLocaleDateString()}</p>
                  )}
                  {member.death_date && (
                    <p><strong>Death Date:</strong> {new Date(member.death_date).toLocaleDateString()}</p>
                  )}
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      onClick={() => setSelectedFamilyMember(member)}
                      className="btn btn-secondary"
                      style={{ marginRight: '0.5rem' }}
                    >
                      Select
                    </button>
                    <button
                      onClick={() => handleEditMember(member)}
                      className="btn btn-info"
                      style={{ marginRight: '0.5rem' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMember(member.id)}
                      className="btn btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Member Form Modal */}
        {showAddMemberForm && (
          <div 
            style={{
              position: 'fixed',
              top: '80px',
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              paddingTop: '20px',
              zIndex: 1001 // Higher than fullscreen modal
            }}
            onClick={() => setShowAddMemberForm(false)}
          >
            <div 
              style={{
                background: 'white',
                color: 'black',
                padding: '20px',
                border: '2px solid green',
                borderRadius: '8px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: 'calc(80vh - 100px)',
                overflowY: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ color: 'green', margin: 0, fontSize: '18px' }}>Add New Family Member</h3>
                <button 
                  onClick={() => setShowAddMemberForm(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: '#666',
                    padding: '5px'
                  }}
                >
                  ×
                </button>
              </div>
              <AddFamilyMemberForm
                onMemberAdded={handleMemberAdded}
                onCancel={() => setShowAddMemberForm(false)}
              />
            </div>
          </div>
        )}

        {/* Edit Member Form Modal */}
        {showEditMemberForm && memberToEdit && (
          <div 
            style={{
              position: 'fixed',
              top: '80px',
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              paddingTop: '20px',
              zIndex: 1001 // Higher than fullscreen modal
            }}
            onClick={() => {
              setShowEditMemberForm(false);
              setMemberToEdit(null);
            }}
          >
            <div 
              style={{
                background: 'white',
                color: 'black',
                padding: '20px',
                border: '2px solid orange',
                borderRadius: '8px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: 'calc(80vh - 100px)',
                overflowY: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ color: 'orange', margin: 0, fontSize: '18px' }}>Edit Family Member</h3>
                <button 
                  onClick={() => {
                    setShowEditMemberForm(false);
                    setMemberToEdit(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: '#666',
                    padding: '5px'
                  }}
                >
                  ×
                </button>
              </div>
              <EditMemberForm
                member={memberToEdit}
                onMemberUpdated={handleMemberUpdated}
                onCancel={() => {
                  setShowEditMemberForm(false);
                  setMemberToEdit(null);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;