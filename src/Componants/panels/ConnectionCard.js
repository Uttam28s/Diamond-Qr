import React from "react";
import { IconAlert, IconCheck, IconLayers, IconWifi } from "../Icons";
import { CONNECTION, ROLE } from "../../store/StoreContext";

/**
 * The sidebar card, replacing the old "OFFLINE - all data is stored locally on
 * this device".
 *
 * That sentence stops being true on a client PC, and a card that lies about where
 * the data is would be worse than no card at all. This says which of the four
 * situations the PC is actually in, and what it means for the person using it.
 *
 * Still offline from the internet's point of view in every case: nothing here ever
 * leaves the office network.
 */
const ConnectionCard = ({ role, connection, queuedCount, hostStatus, readOnly }) => {
  const card = (() => {
    if (role === ROLE.CLIENT) {
      if (connection.status === CONNECTION.ONLINE) {
        return {
          tone: "ok",
          icon: <IconCheck size={16} />,
          title: "CONNECTED",
          text: "Working on the office PC's data. Everything you save goes straight there.",
        };
      }

      if (connection.status === CONNECTION.REFUSED) {
        return {
          tone: "bad",
          icon: <IconAlert size={16} />,
          title: "NOT ALLOWED",
          text:
            connection.detail ||
            "The office PC refused this computer. Check with your administrator.",
        };
      }

      return {
        tone: "warn",
        icon: <IconAlert size={16} />,
        title: "OFFICE PC OFFLINE",
        text: queuedCount
          ? `Scanning still works. ${queuedCount} change(s) will upload when the office PC is back on.`
          : "Scanning still works and will upload later. Editing lots needs the office PC.",
      };
    }

    if (role === ROLE.HOST) {
      if (hostStatus && hostStatus.error) {
        return {
          tone: "bad",
          icon: <IconAlert size={16} />,
          title: "OTHER PCs CANNOT CONNECT",
          text: hostStatus.error,
        };
      }

      const connected = hostStatus ? hostStatus.clients.length : 0;
      const seats = hostStatus ? hostStatus.seats : 0;

      return {
        tone: "ok",
        icon: <IconLayers size={16} />,
        title: "HOST",
        text: `This PC holds the data. ${connected} other computer(s) connected${
          seats ? ` of ${seats} allowed` : ""
        }.`,
      };
    }

    return {
      tone: "plain",
      icon: <IconWifi size={16} />,
      title: "OFFLINE",
      text: "All data is stored on this device only. Nothing is sent over the network.",
    };
  })();

  return (
    <div className={`conn-card tone-${card.tone}`}>
      <p className="conn-title">
        {card.icon}
        {card.title}
      </p>
      <p className="conn-text">{card.text}</p>
      {readOnly && (
        <p className="conn-badge">Scan station — lots and Kapans are read-only here</p>
      )}
    </div>
  );
};

export default ConnectionCard;
