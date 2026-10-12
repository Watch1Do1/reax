import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;
let prevBodyPosition = "";
let prevBodyTop = "";
let prevBodyLeft = "";
let prevBodyRight = "";
let prevBodyWidth = "";
let prevBodyOverflow = "";
let prevHtmlOverscroll = "";

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      const body = document.body;
      const html = document.documentElement;

      prevBodyPosition = body.style.position;
      prevBodyTop = body.style.top;
      prevBodyLeft = body.style.left;
      prevBodyRight = body.style.right;
      prevBodyWidth = body.style.width;
      prevBodyOverflow = body.style.overflow;
      prevHtmlOverscroll = html.style.overscrollBehavior;

      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
    }

    lockCount++;

    return () => {
      lockCount--;
      if (lockCount <= 0) {
        lockCount = 0;
        const body = document.body;
        const html = document.documentElement;

        body.style.position = prevBodyPosition;
        body.style.top = prevBodyTop;
        body.style.left = prevBodyLeft;
        body.style.right = prevBodyRight;
        body.style.width = prevBodyWidth;
        body.style.overflow = prevBodyOverflow;
        html.style.overscrollBehavior = prevHtmlOverscroll;

        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}
