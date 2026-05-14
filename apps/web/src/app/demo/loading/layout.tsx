import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loading",
};

export default function LoadingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
