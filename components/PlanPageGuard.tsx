'use client';
import { usePlanCheck } from '@/lib/usePlanGuard';
import { PlanGuard } from '@/components/PlanGuard';

export function PlanPageGuard({
  feature,
  requiredPlan,
  children,
}: {
  feature: string;
  requiredPlan: string;
  children: React.ReactNode;
}) {
  const { plan, loading, isAdmin } = usePlanCheck();
  if (loading) return null;
  return (
    <PlanGuard feature={feature} requiredPlan={requiredPlan} currentPlan={plan} isAdmin={isAdmin}>
      {children}
    </PlanGuard>
  );
}
