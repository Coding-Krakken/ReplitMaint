import React from 'react';
import { EnterprisePerformanceMonitor } from '@/components/admin/EnterprisePerformanceMonitor';

const EnterpriseMonitoring: React.FC = () => {
  return (
    <div className="container mx-auto p-6">
      <EnterprisePerformanceMonitor />
    </div>
  );
};

export default EnterpriseMonitoring;