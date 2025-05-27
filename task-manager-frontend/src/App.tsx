import React from 'react';
import Auth, { LoginScreen } from './Auth';
import TaskManager from './TaskManager';
import './mobile.css';

const App: React.FC = () => {
  return (
    <div className="App">
      <Auth>
        {(user, loading) => {
          if (loading) {
            return (
              <div className="mobile-loading" style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '1.2rem',
                backgroundColor: '#f8fafc',
                padding: '2rem'
              }}>
                <div className="mobile-loading-spinner" style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid #e2e8f0',
                  borderTop: '3px solid #3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '1rem'
                }}></div>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                  Loading TaskFlow...
                </div>
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
