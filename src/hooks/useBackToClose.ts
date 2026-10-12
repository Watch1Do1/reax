import { useEffect, useRef } from "react";

export function useBackToClose(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pushedRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    // Push a dummy history state entry so back button/swipe navigates back here
    window.history.pushState({ modalLayer: true }, "");
    pushedRef.current = true;

    const handlePopState = () => {
      pushedRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (pushedRef.current) {
        pushedRef.current = false;
        try {
          window.history.back();
        } catch {}
      }
    };
  }, [active]);
}
