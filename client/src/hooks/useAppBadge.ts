import { useEffect, useRef } from "react";

const BASE_TITLE = "Production Planner";
const FAVICON_32 = "/icons/icon-32.png";

function drawFaviconBadge(count: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 32, 32);

    if (count > 0) {
      const r = 9;
      const x = 32 - r;
      const y = r;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = "#ef4444";
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${count > 9 ? 9 : 11}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(count > 99 ? "99+" : String(count), x, y + 0.5);
    }

    const link: HTMLLinkElement =
      (document.querySelector("link[rel~='icon']") as HTMLLinkElement) ||
      document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = canvas.toDataURL("image/png");
    document.head.appendChild(link);
  };
  img.onerror = () => {
    if (count <= 0) return;
    ctx.clearRect(0, 0, 32, 32);
    const r = 10;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, 2 * Math.PI);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(count > 99 ? "99+" : String(count), r, r + 0.5);

    const link: HTMLLinkElement =
      (document.querySelector("link[rel~='icon']") as HTMLLinkElement) ||
      document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = canvas.toDataURL("image/png");
    document.head.appendChild(link);
  };
  img.src = FAVICON_32;
}

function resetFavicon(): void {
  const link: HTMLLinkElement =
    (document.querySelector("link[rel~='icon']") as HTMLLinkElement) ||
    document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = FAVICON_32;
  document.head.appendChild(link);
}

export function useAppBadge(unreadCount: number): void {
  const prevCount = useRef<number>(-1);

  useEffect(() => {
    if (prevCount.current === unreadCount) return;
    prevCount.current = unreadCount;

    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${BASE_TITLE}`;
      drawFaviconBadge(unreadCount);
      if ("setAppBadge" in navigator) {
        (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> })
          .setAppBadge(unreadCount)
          .catch(() => {});
      }
    } else {
      document.title = BASE_TITLE;
      resetFavicon();
      if ("clearAppBadge" in navigator) {
        (navigator as Navigator & { clearAppBadge: () => Promise<void> })
          .clearAppBadge()
          .catch(() => {});
      }
    }
  }, [unreadCount]);

  useEffect(() => {
    return () => {
      document.title = BASE_TITLE;
      resetFavicon();
      if ("clearAppBadge" in navigator) {
        (navigator as Navigator & { clearAppBadge: () => Promise<void> })
          .clearAppBadge()
          .catch(() => {});
      }
    };
  }, []);
}
