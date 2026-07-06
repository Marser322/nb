import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export const alt = "New Brothers | Barbería Premium en Uruguay";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [oswaldBold, oswaldMedium, backgroundBuffer, logoBuffer] = await Promise.all([
    readFile(join(process.cwd(), "src/app/fonts/oswald-bold.ttf")),
    readFile(join(process.cwd(), "src/app/fonts/oswald-medium.ttf")),
    readFile(join(process.cwd(), "public/images/hero/ambiente-barberia.jpg")),
    readFile(join(process.cwd(), "public/logo-transparent.png")),
  ]);

  const backgroundSrc = `data:image/jpeg;base64,${backgroundBuffer.toString("base64")}`;
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#0a0a0a",
        }}
      >
        {/* Fondo con foto de ambiente */}
        <img
          src={backgroundSrc}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            width: "1200px",
            height: "630px",
            objectFit: "cover",
          }}
        />
        {/* Overlay oscuro */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "1200px",
            height: "630px",
            backgroundColor: "rgba(10, 10, 10, 0.72)",
          }}
        />

        {/* Contenido */}
        <div
          style={{
            position: "relative",
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 80px",
          }}
        >
          {/* Texto izquierda */}
          <div style={{ display: "flex", flexDirection: "column", maxWidth: "680px" }}>
            <div style={{ display: "flex", fontFamily: "Oswald-Bold", fontSize: 96, lineHeight: 1.05 }}>
              <span style={{ color: "#F5F1E8" }}>NEW</span>
            </div>
            <div style={{ display: "flex", fontFamily: "Oswald-Bold", fontSize: 96, lineHeight: 1.05 }}>
              <span style={{ color: "#D4AF37" }}>BROTHERS</span>
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Oswald-Medium",
                fontSize: 30,
                color: "#F5F1E8",
                marginTop: 24,
              }}
            >
              Salón de Estética Masculina
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Oswald-Medium",
                fontSize: 22,
                color: "rgba(245, 241, 232, 0.75)",
                marginTop: 12,
              }}
            >
              Reservas online · Barbería premium en Uruguay
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Oswald-Medium",
                fontSize: 24,
                color: "#D4AF37",
                marginTop: 40,
              }}
            >
              nbbarber.com
            </div>
          </div>

          {/* Logo derecha, dentro de aro dorado, sin caja de fondo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 340,
              height: 340,
              borderRadius: "50%",
              border: "3px solid #D4AF37",
              flexShrink: 0,
            }}
          >
            <img
              src={logoSrc}
              alt=""
              width={300}
              height={300}
              style={{ width: 300, height: 300, objectFit: "contain" }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Oswald-Bold", data: oswaldBold, weight: 700, style: "normal" },
        { name: "Oswald-Medium", data: oswaldMedium, weight: 500, style: "normal" },
      ],
    }
  );
}
