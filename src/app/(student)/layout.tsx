import { BottomNav } from "@/components/BottomNav";
import { CartProvider } from "@/components/CartProvider";
import { StudentHeader } from "@/components/StudentHeader";

export default function StudentLayout({ children }: LayoutProps<"/">) {
  return (
    <CartProvider>
      <div className="mx-auto min-h-dvh w-full max-w-xl pb-28">
        <StudentHeader />
        <main id="main" className="px-4 pt-3">
          {children}
        </main>
        <BottomNav />
      </div>
    </CartProvider>
  );
}
