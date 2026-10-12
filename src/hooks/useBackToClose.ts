import { useEffect, useRef, type MutableRefObject } from "react";

interface LayerRecord {
  id: string;
  onCloseRef: MutableRefObject<() => void>;
}

// Module-level stack of active layers
const layerStack: LayerRecord[] = [];

// Module-level counter of programmatic history.back() calls to ignore
let pendingProgrammaticBacks = 0;

// Shared popstate listener attached once
let isListenerAttached = false;

function ensurePopStateListener() {
  if (isListenerAttached || typeof window === "undefined") return;

  window.addEventListener("popstate", () => {
    // If this was triggered by our own programmatic history.back() cleanup, consume and ignore
    if (pendingProgrammaticBacks > 0) {
      pendingProgrammaticBacks--;
      return;
    }

    // Otherwise, this was a genuine user Back press / gesture.
    // Close only the topmost layer.
    if (layerStack.length > 0) {
      const top = layerStack.pop();
      if (top) {
        top.onCloseRef.current();
      }
    }
  });

  isListenerAttached = true;
}

let nextLayerId = 1;

export function useBackToClose(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;

    ensurePopStateListener();

    const layerId = `layer_${nextLayerId++}`;
    idRef.current = layerId;

    // Push layer onto stack
    const record: LayerRecord = {
      id: layerId,
      onCloseRef,
    };
    layerStack.push(record);

    // Push dummy history entry
    window.history.pushState({ modalLayer: layerId }, "");

    return () => {
      // Find if this layer is still in the stack
      const index = layerStack.findIndex((l) => l.id === layerId);

      if (index !== -1) {
        // Layer unmounted or became inactive without being closed by popstate.
        // Remove it from the stack, mark that we are removing its history entry programmatically,
        // and trigger history.back()
        layerStack.splice(index, 1);
        pendingProgrammaticBacks++;
        try {
          window.history.back();
        } catch {
          // If history.back fails, rollback pending counter
          if (pendingProgrammaticBacks > 0) {
            pendingProgrammaticBacks--;
          }
        }
      }

      if (idRef.current === layerId) {
        idRef.current = null;
      }
    };
  }, [active]);
}
