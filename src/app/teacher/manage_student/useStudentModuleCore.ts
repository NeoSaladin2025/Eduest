import { useState, useCallback } from 'react';

export type StudentServiceType = 'ACCOUNT_MANAGEMENT';

interface StudentModuleState {
  activeService: StudentServiceType;
  isLoading: boolean;
}

export const useStudentModuleCore = () => {
  const [state, setState] = useState<StudentModuleState>({
    activeService: 'ACCOUNT_MANAGEMENT',
    isLoading: false,
  });

  const switchService = useCallback((service: StudentServiceType) => {
    setState((prev) => ({ ...prev, activeService: service }));
  }, []);

  return { ...state, switchService };
};