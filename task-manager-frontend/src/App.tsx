import React from 'react';
import Auth, { LoginScreen } from './Auth';
import TaskManager from './TaskManager';

const App: React.FC = () => {
  return (
    <div className="App">
      <Auth>
        {(user, loading) => {
          if (loading) {
            return (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                fontFamily: 'Arial, sans-serif',
                fontSize: '1.2rem'
              }}>
                🔄 Loading Task Manager...
              </div>
            );
          }

          if (!user) {
            return <LoginScreen />;
          }

          return <TaskManager user={user} />;
        }}
      </Auth>
    </div>
  );
};

export default App;
