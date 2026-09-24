import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<Mark size={512} />, size);
}

export function Mark({ size }: { size: number }) {
  const u = size / 512;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #1a1f2b 0%, #0b0d12 100%)",
      }}
    >
      <div style={{ display: "flex", position: "relative", width: 300 * u, height: 240 * u }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 190 * u,
            height: 150 * u,
            borderRadius: 48 * u,
            background: "#ffb547",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 190 * u,
            height: 150 * u,
            borderRadius: 48 * u,
            background: "#4fd1c5",
            opacity: 0.95,
          }}
        />
      </div>
    </div>
  );
}
