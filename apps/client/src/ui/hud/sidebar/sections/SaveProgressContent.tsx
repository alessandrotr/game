import { UpgradeAccountForm } from '../../../UpgradeAccountDialog';
import { useSidebarStore } from '../useSidebarStore';

/**
 * Sidebar host for the guest account-upgrade form. On success the account is
 * claimed (`guest` → false), which both removes this rail entry and collapses the
 * panel via `onDone`.
 */
export function SaveProgressContent() {
  const close = useSidebarStore((s) => s.close);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <UpgradeAccountForm onDone={close} />
    </div>
  );
}
