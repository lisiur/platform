import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Form",
};

export default function FormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
