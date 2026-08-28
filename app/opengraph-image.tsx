import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_SUPPORT_LINE, SITE_TAGLINE } from "@/lib/constants";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0B1220",
          padding: 80,
          color: "white",
        }}
      >
        <div style={{ fontSize: 22, color: "#1B8CFF", letterSpacing: 4 }}>
          {SITE_SUPPORT_LINE}
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, marginTop: 16 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 32, color: "#CBD5E1", marginTop: 16 }}>{SITE_TAGLINE}</div>
      </div>
    ),
    { ...size },
  );
}
