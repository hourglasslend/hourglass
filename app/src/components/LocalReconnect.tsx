"use client";

import { useEffect } from "react";
import { useConnect, useConnection, useConnectors } from "wagmi";
import { isLocalRpc } from "@/lib/deployments";

export const LOCAL_FLAG = "hourglass.localAccount";

/** Local chain only: reconnect the local test account after a page reload when the developer had
 *  chosen it. Real wallets reconnect through wagmi as usual. */
export function LocalReconnect() {
  const { isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect } = useConnect();
  useEffect(() => {
    if (!isLocalRpc || isConnected) return;
    let wanted = false;
    try {
      wanted = localStorage.getItem(LOCAL_FLAG) === "1";
    } catch {}
    const local = connectors.find((c) => c.id === "localAnvil");
    if (wanted && local) connect({ connector: local });
  }, [isConnected, connectors, connect]);
  return null;
}
