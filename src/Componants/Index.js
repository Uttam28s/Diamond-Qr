import React, { useEffect, useState } from "react";
import LeftBar from "./LeftSide/LeftBar";
import RightBar from "./RighrSide/RightBar";

const Index = () => {
  const [category, setCategory] = useState([]);
  const [total, setTotal] = useState({});
  const [isAuthenticate, setIsAuthenticate] = useState(false);
  useEffect(() => {
    setIsAuthenticate(localStorage.getItem("isAuthenticate"));
  }, []);

  const setData = (d) => {
    const split = d.split(",");
    const kWeight = parseFloat(split[split.length - 2]);
    const pWeight = parseFloat(split[split.length - 1]);
    const percentage = ((pWeight / kWeight) * 100).toFixed(2);
    const scanVal = {
      kWeight,
      pWeight,
      percentage,
    };
    let cateArray = JSON.parse(localStorage.getItem("category")) || [];
    let totalValue = JSON.parse(localStorage.getItem("total")) || {};
    const mainTotal = {
      kWeight: parseFloat(((totalValue.kWeight || 0) + kWeight).toFixed(3)),
      pWeight: parseFloat(((totalValue.pWeight || 0) + pWeight).toFixed(3)),
    };
    cateArray.push(scanVal);
    setCategory(cateArray);
    setTotal(mainTotal);
    window.localStorage.setItem("category", JSON.stringify(cateArray));
    window.localStorage.setItem("total", JSON.stringify(mainTotal));
  };

  const clear = () => {
    setCategory([]);
    setTotal({});
  };

  return (
    <div>
      {isAuthenticate ? (
        <>
          <div className="main-screen-wrapper" style={{ position: "relative" }}>
            <LeftBar setData={setData} clear={clear} />
            <RightBar category={category} total={total} clear={clear} />
          </div>
          <div
            style={{
              backgroundColor: "white",
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
              position: "absolute",
              bottom: 0,
            }}
          >
            <h5>Copyright © 2023-2025 Zeonlabs Pvt. Ltd. </h5>
            <h5>Contact no : 8154831233</h5>
          </div>
        </>
      ) : (
        <div
          style={{
            width: "100%",
            height: "90vh",
            display: "flex",
            justifyContent: "center",
            alignContent: "center",
            alignItems: "center",
          }}
        >
          <div style={{ width: "60%", backgroundColor: "white" }}>
            <h2>Please contact admin to use this software</h2>
            <h2>Contact no:- 8154831233</h2>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
