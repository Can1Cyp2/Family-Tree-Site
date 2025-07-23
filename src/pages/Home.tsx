
import React from 'react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
  return (
    <div className="container text-center mt-5">
      <h1>Welcome to the Family Tree Maker</h1>
      <p>Create and share your family tree with ease.</p>
      <Link to="/login" className="btn btn-primary">Get Started</Link>
    </div>
  );
};

export default Home;
