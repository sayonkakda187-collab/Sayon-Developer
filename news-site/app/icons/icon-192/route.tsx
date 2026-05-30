import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#111827",
          color: "#ffffff",
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -4,
          fontFamily: "sans-serif",
        }}
      >
        DL
      </div>
    ),
    { width: 192, height: 192 },
  );
}
