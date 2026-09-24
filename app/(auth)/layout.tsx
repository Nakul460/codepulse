import { ReactNode } from "react";

export default function authLayout({children}:{children:ReactNode}) {
  return <div className="grid w-full min-h-screen place-items-center">{children}</div>;
}
