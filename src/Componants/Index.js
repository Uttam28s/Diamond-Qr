import React, { useEffect, useState } from "react";
import LeftBar from "./LeftSide/LeftBar";
// import RightBar from "./RighrSide/RightBar";
import WeightSortBar from "./RighrSide/WeightSortBar";
import { fifthNumber } from "./functions";

const Index = () => {
  // const [category, setCategory] = useState([]);
  // const [total, setTotal] = useState({});
  const [isAuthenticate, setIsAuthenticate] = useState(false);

  
  const [data, setData] = useState([])
  const [togle,setTogle]=useState(false)
  useEffect(() => {
    setIsAuthenticate(localStorage.getItem("isAuthenticate"));
  }, []);

  // const setData = (d) => {
  //   const split = d.split(",");
  //   const kWeight = parseFloat(split[split.length - 2]);
  //   const pWeight = parseFloat(split[split.length - 1]);
  //   const percentage = ((pWeight / kWeight) * 100).toFixed(2);
  //   const scanVal = {
  //     kWeight,
  //     pWeight,
  //     percentage,
  //   };
  //   let cateArray = JSON.parse(localStorage.getItem("category")) || [];
  //   let totalValue = JSON.parse(localStorage.getItem("total")) || {};
  //   const mainTotal = {
  //     kWeight: parseFloat(((totalValue.kWeight || 0) + kWeight).toFixed(3)),
  //     pWeight: parseFloat(((totalValue.pWeight || 0) + pWeight).toFixed(3)),
  //   };
  //   cateArray.push(scanVal);
  //   setCategory(cateArray);
  //   setTotal(mainTotal);
  //   window.localStorage.setItem("category", JSON.stringify(cateArray));
  //   window.localStorage.setItem("total", JSON.stringify(mainTotal));
  // };

  const clear = () => {
    setData('')
    // setCategory([]);
    // setTotal({});
  };

 
  const setdata = (d) => {
     let dataArry = [...data]
     dataArry.push(d)
     setData(dataArry);
     setTogle(!togle)
     localStorage.setItem("allcode",JSON.stringify(d))
     let cateArray = JSON.parse(localStorage.getItem("category")) || [];
     let uncate =  JSON.parse(localStorage.getItem("uncate")) ||[];
     let uncateFlag = true
 
    cateArray.map((val, i) => {
      let startRange = val.startRange;
      let endRange = val.endRange;
      let list = cateArray[i].list ? [...cateArray[i].list]:[];
       if( fifthNumber(d) >= startRange &&
       fifthNumber(d) <= endRange
          ){
           list.push(d);
           uncateFlag = false
          }
          cateArray[i].list=[...list]
          return ''
    });
    if(uncateFlag){
     uncate.push(d)
    }
    localStorage.setItem('category',JSON.stringify(cateArray))
    localStorage.setItem('uncate',JSON.stringify(uncate))
       localStorage.setItem("allcode", JSON.stringify(data));
 
 
  }

  return (
    <div>
      {isAuthenticate ? (
        <>
          <div className="main-screen-wrapper" style={{ position: "relative" }}>
            <LeftBar data={data} setdata={setdata} clear={clear} />
            {/* <RightBar category={category} total={total} clear={clear} /> */}
            
            <WeightSortBar data={data} setdata={setdata} clear={clear} />


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
