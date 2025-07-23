export interface FamilyMember {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  birth_date?: string;
  death_date?: string;
  gender: 'male' | 'female' | 'other';
  photo_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  user_id: string;
  person1_id: string;
  person2_id: string;
  relationship_type: 'parent' | 'child' | 'spouse' | 'sibling';
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface FamilyNode {
  member: FamilyMember;
  parents: FamilyMember[];
  children: FamilyMember[];
  spouses: FamilyMember[];
  siblings: FamilyMember[];
  generation: number;
  position: number;
}

export interface TreePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}