import React from "react";
import ReactDOM from "react-dom";
import TripleToggleSwitch from "./triple";

const TogleSwitch = (props) => {
  const labels = {
    left: {
      title: "left",
      value: "left"
    },
    right: {
      title: "right",
      value: "right"
    },
    center: {
      title: "",
      value: "center"
    }
  };

  const onChange = (value) =>{ props.onChange(value)};

  return (
    <div>
      <TripleToggleSwitch labels={labels} onChange={onChange} position={props.position} />
    </div>
  );
};

export default TogleSwitch
