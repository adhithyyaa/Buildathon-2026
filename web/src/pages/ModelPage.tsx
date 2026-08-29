import { useRefresh } from '../lib/refresh';
import { ModelPanel } from '../components/ModelPanel';
import { UpliftPanel } from '../components/UpliftPanel';
import { ModelHealthPanel } from '../components/ModelHealthPanel';

export function ModelPage() {
  const { version } = useRefresh();
  // Remount on a demo action so the freshly-served model metrics reload.
  return (
    <div className="space-y-6" key={version}>
      <UpliftPanel />
      <ModelHealthPanel />
      <ModelPanel />
    </div>
  );
}
