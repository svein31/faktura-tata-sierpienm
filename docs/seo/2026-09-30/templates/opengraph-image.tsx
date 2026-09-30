import { ImageResponse } from "next/og";
export const alt = "FakturaProsto — faktury online i KSeF 2.0";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column",
      justifyContent: "center", width: "100%", height: "100%",
      padding: 72, background: "#111827", color: "#ffffff" }}>
      <div style={{ display: "flex", fontSize: 36 }}>FakturaProsto</div>
      <div style={{ display: "flex", marginTop: 32, fontSize: 64,
        fontWeight: 700 }}>Faktury online z KSeF 2.0</div>
      <div style={{ display: "flex", marginTop: 32, fontSize: 30,
        color: "#c7d2fe" }}>Free: 5 faktur/mies. • Demo bez rejestracji</div>
    </div>, size
  );
}
