import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh w-full place-items-center px-4 py-8">
      {children}
    </div>
  );
}
