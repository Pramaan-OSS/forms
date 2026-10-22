"use client";

import NextError from "next/error";

export default function GlobalError({ error }: Readonly<{ error: Error & { digest?: string } }>) {
  void error;
  return (
    <html lang="en-US">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
