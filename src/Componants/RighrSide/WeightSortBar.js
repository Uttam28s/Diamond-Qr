import React, { useState, useEffect } from "react";
import Input from "@mui/material/Input";
import FormControl from "@mui/material/FormControl";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CategoriesCard from "./CategoriesCard";
import TogleSwitch from "../TogleSwitch/index";
import ChangeCircleOutlinedIcon from "@mui/icons-material/ChangeCircleOutlined";
import AddTaskOutlinedIcon from "@mui/icons-material/AddTaskOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import {
  NotificationContainer,
  NotificationManager,
} from "react-notifications";
import "react-notifications/lib/notifications.css";
import {
  randomcolor,
} from "../functions";

const WeightSortBar = (props) => {
  // const [codes, setCodes] = useState([]);
  const [startCode, setStartCode] = useState("");
  const [endCode, setEndCode] = useState("");
  const [categories, setCategories] = useState([]);
  // const [all, setAll] = useState([]);
  const [error, setError] = useState("");
  const [togleBar, setTogleBar] = useState("left");
  const [openDelete, setOpenDelete] = useState("");
  const [unCateData, setUncateData] = useState([]);

  const deleteCard = (id) => {
    let card = JSON.parse(window.localStorage.getItem("category"));
    let filter = card.filter((d) => d.id !== id);

    window.localStorage.setItem("category", JSON.stringify(filter));
    setCategories(filter);
    setOpenDelete("");
    NotificationManager.success("Remove Sucessfully");
  };

  useEffect(() => {
    setCategories(JSON.parse(window.localStorage.getItem("category")) || []);
    // setCodes(window.localStorage.getItem("allcode") || []);
  }, []);

  useEffect(() => {
    // setCodes(window.localStorage.getItem("allcode") || []);
  }, [togleBar, props?.data?.length]);

  useEffect(() => {
    let cateArray = JSON.parse(localStorage.getItem("category")) || [];
    let uncate = JSON.parse(localStorage.getItem("uncate")) || [];

    // let uncate = [...props.data];
    // cateArray.map((val, i) => {
    //   let startRange = val.startRange;
    //   let endRange = val.endRange;
    //   cateArray[i].list = props.data.length
    //     ? props.data.filter(
    //         (data) =>
    //           lastOneNumber(data) >= startRange &&
    //           lastOneNumber(data) <= endRange
    //       )
    //     : [];
    //   cateArray[i].list.map((d) => {
    //     uncate = uncate.filter((a) => a !== d);
    //   });
    // });
    setUncateData(uncate);
    setCategories(cateArray);
    // localStorage.setItem('category',JSON.stringify(cateArray))
  }, [togleBar, props?.data?.length]);

  const resetCard = (id) => {
    let cateArray = JSON.parse(localStorage.getItem("category"));
    cateArray.map((data, i) => {
      if (data.id === id) {
        cateArray[i].list = [];
      }
      return ''
    });

    localStorage.setItem("category", JSON.stringify(cateArray));
    setCategories(cateArray);
  };

  const setunCate = (allData, startRange, endRange) => {
    let total1 = 0,
      total2 = 0;
      // 1.41,13.1,33.69,60.7,41.35,5.5,0.032,0.011,D,ST1,Round,gt-6-327-2
    let filteredList =
      allData.length &&
      allData.filter((data) => {
        let checkData = data.split(",").slice(-6,-4).map(Number);
        if (
          (startRange &&
            endRange &&
            checkData[1] >= startRange &&
            checkData[0] <= endRange) 
        ) {
          total1 = total1 + checkData[0];
          total2 = total2 + checkData[1];
          return data;
        }
        return '';
      });

    return { filteredList, total1, total2 };
  };

  const reset = () => {
    setStartCode("");
    setEndCode("");
    setError("");
  };

  const addCategories = (id, newStartCode, newEndCode) => {
    let cateArray = JSON.parse(localStorage.getItem("category")) || [];
    if (id) {
      cateArray = cateArray.filter((data) => data.id !== id);
    }
    let newRangeStart = Number(id ? newStartCode : startCode);
    let newRangeEnd = Number(id ? newEndCode : endCode);
    if (newRangeStart > newRangeEnd) {
      NotificationManager.error("Range as Error");
      return;
    }
    if (cateArray.length) {
      let flag = true;
      cateArray.map((data) => {
        let range = [data.startRange, data.endRange];
        if (
          range.includes(newRangeStart) ||
          range.includes(newRangeEnd) ||
          (data.startRange > newRangeStart && data.endRange < newRangeStart) ||
          (newRangeEnd > data.startRange && newRangeEnd < data.endRange) ||
          (newRangeStart > data.startRange && newRangeStart < data.endRange) ||
          (newRangeEnd > data.startRange && newRangeEnd < data.endRange)
        ) {
          flag = false;
        }
        return ''
      });
      if (flag) {

        cateArray.push({
          startRange: newRangeStart,
          endRange: newRangeEnd,
          id: `${newRangeStart}-${newRangeEnd}`,
          color: randomcolor(),
        });
        NotificationManager.success("Added");
      } else {
        if (id) {
          cateArray.push({
            startRange: id.split("-")[0],
            endRange: id.split("-")[1],
            id: id,
            color: randomcolor(),
          });
        }
        NotificationManager.error("Range Not Valid");
      }
    } else {
      cateArray.push({
        startRange: newRangeStart,
        endRange: newRangeEnd,
        id: `${newRangeStart}-${newRangeEnd}`,
        color: randomcolor(),
      });
      NotificationManager.success("Added");
    }
    setCategories(cateArray);
    localStorage.setItem("category", JSON.stringify(cateArray));
  };

  return (
    <div className="right-bar-wrapper seprater">
      <div className="top-bar-header">
        <NotificationContainer />

        <div className="main-right-wrapper top-bar-header">
          <div className="card-wrapper w-100">
            {/* <CardContent> */}
            <div>
              <div className="form-wrapper">
                {/* <Card className="input-box-mui"> */}
                {/* <CardContent> */}
                <div className="d-flex">
                  {/* <div className="font-medium">Start Code</div> */}
                  <FormControl sx={{ m: 1 }} variant="standard">
                    <Input
                      id="start-code"
                      placeholder="start code"
                      value={startCode}
                      onChange={(e) => {
                        setStartCode(e.target.value?.trim());
                        setError("");
                      }}
                    />
                  </FormControl>
                </div>
                {/* </CardContent> */}
                {/* </Card> */}
                {/* <Card className="input-box-mui"> */}
                {/* <CardContent> */}
                <div className="d-flex">
                  {/* <div className="font-medium">End Code</div> */}
                  <FormControl sx={{ m: 1 }} variant="standard">
                    <Input
                      id="end-code"
                      placeholder="end code"
                      value={endCode}
                      onChange={(e) => {
                        setEndCode(e.target.value?.trim());
                        setError("");
                      }}
                    />
                  </FormControl>
                </div>
                {/* </CardContent> */}
                {/* </Card> */}
                <div className="flex-row button-wrapper w-10">
                  <Button
                    variant="contained"
                    className="button-form"
                    onClick={() => addCategories()}
                  >
                    <AddTaskOutlinedIcon />
                  </Button>
                  <Button
                    variant="contained"
                    className="button-form"
                    onClick={reset}
                  >
                    <ChangeCircleOutlinedIcon />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {/* </CardContent> */}
          <div className="error-input">{""}</div>
        </div>
        <div className=" align-end m-1">
          <TogleSwitch
            position={togleBar}
            onChange={(value) => {
              setTogleBar(value);
            }}
          />
        </div>
      </div>
      <p className="sep"></p>

      <Card className="card-wrapper m-1 p-1">
        <CardContent className="p-0">
          <div className="categories-wrapper">
            {togleBar === "right" && (
              <div
                className={`single-cate-wrapper ${
                  togleBar !== "center" && "w-100"
                }`}
              >
                <CardContent
                // style={{ background: data.random,color: data.invert,}}
                // className={`${data.id == openDelete && "blur-back"}`}
                >
                  {unCateData.length &&
                    unCateData.map((d) => {
                      return <p>{d}</p>;
                    })}
                </CardContent>
              </div>
            )}

            {togleBar === "center" && (
              <div className={`categories-wrapper`}>
                {/* <CardContent
         // style={{ background: data.random,color: data.invert,}}
         // className={`${data.id == openDelete && "blur-back"}`}
       > */}

                {categories.length &&
                  categories.map((data) =>
                    Object.keys(data).length > 2 ? (
                      <div className="single-cate-wrapper">
                        {" "}
                        <div
                          style={{
                            background: data?.color?.random,
                            color: data?.color?.invert,
                          }}
                          className={`${data.id === openDelete && "blur-back"}`}
                        >
                          <CategoriesCard
                            startRange={data.startRange}
                            endRange={data.endRange}
                            id={data.id}
                            list={data.list?.reverse() || []}
                            addCategories={addCategories}
                            togleBar={togleBar}
                            setunCate={setunCate}
                            openDelete={openDelete}
                            setOpenDelete={setOpenDelete}
                            resetCard={resetCard}
                          >
                            {openDelete === data.id && (
                              <div
                                className="popup-tooltip"
                                style={{ background: "#FFFFFF" }}
                              >
                                <div className="content-tippy">
                                  {"Are Sure to Remove this This Category?"}
                                </div>
                                <div className="button-box">
                                  {error !== "Range is Allready exits" && (
                                    <span
                                      onClick={() => {
                                        deleteCard(data.id);
                                        setError("");
                                      }}
                                    >
                                      <Button
                                        variant="contained"
                                        color="success"
                                      >
                                        <CheckCircleIcon />
                                      </Button>
                                    </span>
                                  )}
                                  <span
                                    onClick={() => {
                                      setOpenDelete("dummy");
                                      setError("");
                                    }}
                                  >
                                    <Button variant="contained" color="error">
                                      {" "}
                                      <CancelIcon />
                                    </Button>
                                  </span>
                                </div>
                              </div>
                            )}
                          </CategoriesCard>{" "}
                        </div>{" "}
                      </div>
                    ) : (
                      "No Category"
                    )
                  )}

                {/* </CardContent> */}
              </div>
            )}

            {togleBar === "left" && (
              <Card className={`single-cate-wrapper list-card-wrapper`}>
                <CardContent
                // style={{ background: data.random,color: data.invert,}}
                // className={`${data.id == openDelete && "blur-back"}`}
                >
                  {props.data.length &&
                    props.data.map((data) => {
                      return <p>{data}</p>;
                    })}
                </CardContent>
              </Card>
            )}

            {/* {(categories.length || togleBar == "left") &&
              (togleBar !== "center" ? all : categories).map((data) => {
                return (
                  <Card
                    className={`single-cate-wrapper ${ togleBar !== "center" && "w-100" }`}>
                    <CardContent
                      style={
                        togleBar == "center"
                          ? {
                              background: data.random,
                              color: data.invert,
                            }
                          : {
                              background: "#FFFFFF",
                              color: "#000000",
                            }
                      }
                      className={`${data.id == openDelete && "blur-back"}`}
                    >
                      <CategoriesCard
                        start={data.start}
                        end={data.end}
                        startRange={data.start.split(",").slice(-2).map(Number)}
                        endRange={data.end.split(",").slice(-2).map(Number)}
                        id={data.id}
                        list={data.list || []}
                        addCategories={addCategories}
                        togleBar={togleBar}
                        setunCate={setunCate}
                        openDelete={openDelete}
                        setOpenDelete={setOpenDelete}
                      >
                        {openDelete == data.id && (
                          <div
                            className="popup-tooltip"
                            style={{ background: "#FFFFFF" }}
                          >
                            <div className="content-tippy">
                            { "Are Sure to Remove this This Category?"}
                            </div>
                            <div className="button-box">
                            {error!=="Range is Allready exits" &&  <span
                                onClick={() => {
                                  deleteCard(data.id);
                                  setError("")
                                }}
                              >
                                <Button variant="contained" color="success">
                                  <CheckCircleIcon />
                                </Button>
                              </span>}
                              <span
                                onClick={() => {
                                  setOpenDelete("dummy");
                                  setError("")
                                }}
                              >
                              <Button variant="contained" color="error">
                                  {" "}
                                  <CancelIcon />
                                </Button>
                              </span>
                            </div>
                          </div>
                        )}
                      </CategoriesCard>
                    </CardContent>
                  </Card>
                );
              })} */}
          </div>
        </CardContent>
      </Card>
      <div className="relative">{/* <ErrorCaseLayout/> */}</div>
    </div>
  );
};

export default WeightSortBar;
