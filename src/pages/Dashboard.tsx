import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import FamilyTree from '../components/FamilyTree';
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

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading your family tree...</div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* RED BOX TEST - Moved to top */}
      {showAddRelationFormMode !== 'none' && (
        <div 
          style={{
            position: 'fixed',
            top: '80px', // Start below the navbar
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '20px',
            zIndex: 1000
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

        {/* Simple always-visible test */}
        <div style={{
          background: 'orange',
          color: 'black',
          padding: '15px',
          margin: '15px 0',
          border: '3px solid black',
          fontSize: '16px',
          fontWeight: 'bold'
        }}>
          🧪 ALWAYS VISIBLE TEST - This should always be visible 🧪
        </div>

        {/* Forms */}
        {showAddMemberForm && (
          <div 
            style={{
              position: 'fixed',
              top: '80px', // Start below the navbar
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              paddingTop: '20px',
              zIndex: 1000
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

        {/* MINIMAL TEST - Replace complex form with simple test */}
        {/*
        {showAddRelationFormMode !== 'none' && (
          <div style={{
            background: 'red',
            color: 'white',
            padding: '50px',
            margin: '20px 0',
            border: '10px solid yellow',
            fontSize: '24px',
            fontWeight: 'bold',
            textAlign: 'center'
          }}>
            🚨 FORM SHOULD BE VISIBLE - MODE: {showAddRelationFormMode} 🚨
            <br />
            <button 
              style={{
                background: 'white',
                color: 'red',
                padding: '10px 20px',
                border: 'none',
                borderRadius: '5px',
                fontSize: '16px',
                marginTop: '20px',
                cursor: 'pointer'
              }}
              onClick={() => {
                console.log('Close button clicked');
                setShowAddRelationFormMode('none');
              }}
            >
              CLOSE THIS TEST
            </button>
          </div>
        )}
        */}

        {/* Original complex form - commented out for now */}
        {/*
        {showAddRelationFormMode !== 'none' && (
          <div style={{ 
            border: '3px solid blue', 
            padding: '10px', 
            margin: '10px 0',
            background: '#d1ecf1'
          }}>
            <h3 style={{ color: 'blue' }}>ADD RELATION FORM IS RENDERED - Mode: {showAddRelationFormMode}</h3>
            <div style={{
              background: 'lime',
              color: 'black',
              padding: '20px',
              margin: '10px 0',
              border: '5px solid black',
              fontSize: '20px',
              fontWeight: 'bold'
            }}>
              🎯 FORM CONTAINER IS VISIBLE - MODE: {showAddRelationFormMode} 🎯
            </div>
            
            <div style={{
              background: 'white',
              border: '2px solid purple',
              padding: '20px',
              margin: '10px 0',
              borderRadius: '8px'
            }}>
              <h4 style={{ color: 'purple', margin: '0 0 15px 0' }}>SIMPLE TEST FORM</h4>
              <p style={{ margin: '10px 0' }}>This is a test form to see if forms are visible at all.</p>
              <input 
                type="text" 
                placeholder="Test input field" 
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  margin: '10px 0'
                }}
              />
              <button 
                style={{
                  background: 'purple',
                  color: 'white',
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  margin: '10px 5px 10px 0'
                }}
                onClick={() => console.log('Test button clicked')}
              >
                Test Button
              </button>
              <button 
                style={{
                  background: 'gray',
                  color: 'white',
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onClick={() => setShowAddRelationFormMode('none')}
              >
                Close Test
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
        )}
        */}

        {showEditMemberForm && memberToEdit && (
          <div style={{ 
            border: '3px solid green', 
            padding: '10px', 
            margin: '10px 0',
            background: '#d4edda'
          }}>
            <h3 style={{ color: 'green' }}>EDIT MEMBER FORM IS RENDERED</h3>
            <EditMemberForm
              member={memberToEdit}
              onMemberUpdated={handleMemberUpdated}
              onCancel={() => {
                setShowEditMemberForm(false);
                setMemberToEdit(null);
              }}
            />
          </div>
        )}
        </div>
    </div>
  );
};

export default Dashboard;