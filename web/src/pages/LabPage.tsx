import { useRefresh } from '../lib/refresh';
import { RecoveryLab } from '../components/RecoveryLab';

export function LabPage() {
  const { version } = useRefresh();
  // Remount after Resolve/Reset so the lift numbers reflect the latest resolved outcomes.
  return <RecoveryLab key={version} />;
}
