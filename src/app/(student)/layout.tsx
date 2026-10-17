import { BottomNav } from "@/components/BottomNav";
import { CartProvider } from "@/components/CartProvider";
import { InstallBanner } from "@/components/InstallBanner";
import { StudentHeader } from "@/components/StudentHeader";

export default function StudentLayout({ children }: LayoutProps<"/">) {
  return (
    <CartProvider>
      <div className="mx-auto min-h-dvh w-full max-w-xl bg-paper pb-28 sm:shadow-canvas">
        <StudentHeader />
        <main id="main" className="px-4 pt-3">
          {children}
          <div className="mt-8">
            <InstallBanner />
          </div>
        </main>
        <BottomNav />
      </div>
    </CartProvider>
  );
}
