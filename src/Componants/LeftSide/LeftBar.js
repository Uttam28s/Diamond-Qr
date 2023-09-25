import React, { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import { NotificationContainer } from "react-notifications";
import CardContent from "@mui/material/CardContent";
import "react-notifications/lib/notifications.css";
import { Button } from "@mui/material";

const LeftBar = (props) => {
  const [currentCode, setCurrentCode] = useState("");
  const [previousCode, setPreviousCode] = useState("");
  useEffect(() => {
    focusInput();
  });

  const focusInput = () => {
    document.getElementById("qrcodeBox").focus();
  };

  // const setQrCode = (data) => {
  //   setCurrentCode(data);
  // }

  // const focusAndSum = (data) => {
  //   setPreviousCode(data);
  //   setCurrentCode(data);
  //   data && props.setData(data);
  //   setCurrentCode("");
  //   focusInput();
  // };
  const focusAndSum = () => {
    setPreviousCode(currentCode);

    setCurrentCode("");
    focusInput();

    //  let ary = props.data; 
    //  currentCode &&  ary.push(currentCode)
    currentCode && props.setData(currentCode)
  }

  const handleClearData = () => {
    setCurrentCode("");
    setPreviousCode("");
    window.localStorage.removeItem("category");
    window.localStorage.removeItem("total");
    props.clear();
    focusInput();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      focusAndSum(event.target.value);
    }
  };

  return (
    <div className="left-bar-wrapper seprater">
      <NotificationContainer />
      <div className="title">Zeonlabs</div>
      <p className="sep"></p>
      <div className="bottam-wraaper">
        <div className="code-box">
          <Card>
            <CardContent className="p-1">
              <p className="title font-medium fnt-white">Scanned Code : </p>
              <input
                type="text"
                className=" font-medium bk-white input-box"
                id="qrcodeBox"
                onKeyDownCapture={handleKeyDown}
                onChange={(e) => {
                  setCurrentCode(e.target.value);
                }}
                value={currentCode}
              />
              {/* {currentCode || ""} */}
            </CardContent>
          </Card>
        </div>
        <div className="code-box">
          <Card>
            <CardContent className="p-1">
              <p className="title font-medium fnt-white">Previous Code : </p>
              {/* <p className="font-medium bk-white input-box">
                {previousCode || ""}
              </p> */}
              <input
                type="text"
                className=" font-medium bk-white input-box"
                id="qrcodeBox"
                value={previousCode || ""}
              />
            </CardContent>
          </Card>
        </div>{" "}
        <div className="d-flex"></div>
        <Button variant="contained"
          onClick={() => { focusAndSum() }}
          onKeyDown={handleKeyDown}>SCAN</Button>
        <Button variant="contained" onClick={handleClearData}>
          Clear
        </Button>{" "}
      </div>
    </div>
  );
};

export default LeftBar;