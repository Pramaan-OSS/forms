"use client";

// Sits inside `(app)/layout.tsx` so a page crash keeps the layout mounted instead of the root
// boundary unmounting it.
export { default } from "@/app/error";
