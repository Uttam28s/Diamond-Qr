import React from "react";

/**
 * Percentage <colgroup> for `table-layout: fixed` tables.
 * Percentages keep every column inside the panel at any window size, so the
 * tables never grow a horizontal scrollbar.
 */
const Cols = ({ widths }) => (
  <colgroup>
    {widths.map((width, index) => (
      <col style={{ width: `${width}%` }} key={index} />
    ))}
  </colgroup>
);

export default Cols;
