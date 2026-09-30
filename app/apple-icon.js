import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Mismo dibujo que icon.svg; iOS no admite SVG, por eso se genera como PNG (sin esquinas redondeadas: iOS las aplica).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#14171a", display: "flex" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <path d="M14 31 32 16l18 15v17a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2z" fill="none" stroke="#b9d9c4" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx="32" cy="38" r="4" fill="#b9d9c4" />
        </svg>
      </div>
    ),
    size
  );
}
