import { Skeleton } from "@/components/ui/Skeleton";

export default function OrdersLoading() {
  return (
    <div aria-busy="true" aria-label="Loading your orders" className="flex flex-col gap-4">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-40" />
      <Skeleton className="h-24" />
    </div>
  );
}
