import { useRefresh } from '../lib/refresh';
import { ModelPanel } from '../components/ModelPanel';

export function ModelPage() {
  const { version } = useRefresh();
  // Remount on a demo action so the freshly-served model metrics reload.
  return <ModelPanel key={version} />;
}
