import React from 'react';
import { FamilyMember, Relationship } from '../types';

interface MixedNodeElementProps {
  nodeDatum: {
    name: string;
    attributes?: {
      [key: string]: string;
    };
    children?: any[];
    __rd3t: {
      collapsed: boolean;
    };
  };
  toggleNode: () => void;
  foreignObjectProps: {
    width: number;
    height: number;
    x: number;
    y: number;
  };
  onNodeClick: (member: FamilyMember) => void;
  member: FamilyMember;
  onDeleteMember: (memberId: string) => void;
  onSelectMember: (member: FamilyMember) => void;
  selectedMember: FamilyMember | null;
  onDeleteRelationship: (relationshipId: string) => void;
}

const MixedNodeElement: React.FC<MixedNodeElementProps> = ({
  nodeDatum,
  toggleNode,
  foreignObjectProps,
  onNodeClick,
  member,
  onDeleteMember,
  onSelectMember,
  selectedMember,
  onDeleteRelationship,
}) => {
  return (
    <React.Fragment>
      <circle r={20}></circle>
      <foreignObject {...foreignObjectProps}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            
            paddingBottom: '1rem',
            backgroundColor: selectedMember?.id === member.id ? '#EEF2FF' : 'rgb(248, 248, 255)', // ghostwhite
            border: selectedMember?.id === member.id ? '2px solid #6366f1' : '1px solid black',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            width: foreignObjectProps.width,
            height: foreignObjectProps.height,
            boxSizing: 'border-box',
            cursor: 'pointer',
          }}
          onClick={() => onNodeClick(member)}
        >
          <h3 style={{ margin: '10px 0 5px 0', fontSize: '1.2em' }}>{nodeDatum.name}</h3>
          {nodeDatum.attributes && (
            <ul style={{ listStyleType: 'none', padding: 0, margin: '0 0 10px 0', textAlign: 'center' }}>
              {Object.keys(nodeDatum.attributes).map((labelKey, i) => (
                <li key={`${labelKey}-${i}`} style={{ fontSize: '0.9em', color: '#555' }}>
                  {labelKey}: {nodeDatum.attributes![labelKey]}
                </li>
              ))}
            </ul>
          )}
          {nodeDatum.children && nodeDatum.children.length > 0 && (
            <button
              style={{
                textAlign: 'center',
                marginTop: 'auto',
                padding: '5px 10px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                backgroundColor: '#f0f0f0',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation(); // Prevent node click when button is clicked
                toggleNode();
              }}
            >
              {nodeDatum.__rd3t.collapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
        </div>
      </foreignObject>
    </React.Fragment>
  );
};

export default MixedNodeElement;