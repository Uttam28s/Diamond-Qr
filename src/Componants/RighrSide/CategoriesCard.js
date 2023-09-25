import React, { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import editIcon from "../../assets/img/edit.svg";
import { width } from "@mui/system";
import Input from "@mui/material/Input";
import { StarTwoTone } from "@mui/icons-material";
import ModeEditTwoToneIcon from "@mui/icons-material/ModeEditTwoTone";
import { Button } from "@mui/material";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import { Tooltip } from "react-tippy";
import "react-tippy/dist/tippy.css";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import RestartAltIcon from '@mui/icons-material/RestartAlt';

const   CategoriesCard = ({
  list,
  addCategories,
  id,
  startRange,
  endRange,
  togleBar,
  setunCate,
  setOpenDelete,
  openDelete,
  children,resetCard
}) => {
  const [edit, setEdit] = useState(false);
  const [startCode, setstartCode] = useState(startRange);
  const [endCode, setendCode] = useState(endRange);
  const [renderList, setRenderList] = useState({ filteredList: [] });
  const [animation , setAnimation] = useState(false)

  useEffect(() => {
    setstartCode(startRange);
    setendCode(endRange);
    setEdit(false);
  }, [startRange, endRange]);

  useEffect(() => {
      const updatedList = setunCate(list,startRange,endRange)
    setRenderList(updatedList);
  }, [startRange, endRange,list?.length,togleBar]);


  useEffect(()=>{
    setAnimation("animation-class")
  },[list?.length])

  useEffect(()=>{
    if(animation){
      setTimeout(()=>{setAnimation("anti-animation-class")},300 )
    }
    // 
  },[animation])

  useEffect(()=>{
    setAnimation("")
  },[])



  return (
      <div className={`${animation}`}>
          <div className="flex">
              <Card
                  className="p-2 m-2 bk-grey coderange-title"
                  style={{
                      width: `${
                          togleBar == "center" && !edit ? "55%" : "100%"
                      }`,
                  }}>
                  {!edit ? (
                      <>
                          <div className="font-medium">
                              {startRange.toString() == "NaN"
                                  ? startRange
                                  : startRange.toString()}
                              <span className="bk-green"></span>-
                              <span className="bka-red">
                                  {endRange.toString() == "NaN"
                                      ? endRange
                                      : endRange.toString()}
                              </span>
                          </div>
                      </>
                  ) : (
                      <div className="edit-row">
                          <p>
                              <Input
                                  id="font-input"
                                  value={startCode}
                                  onChange={(e) => {
                                      setstartCode(e.target.value?.trim());
                                  }}
                              />
                              <Input
                                  id="font-input"
                                  value={endCode}
                                  onChange={(e) => {
                                      setendCode(e.target.value?.trim());
                                  }}
                              />
                              <div className="flex-row true-false-button">
                                  <div className="">
                                      <Card
                                          className="flex p-1 bk-green hover-icon  coderange-title  w-100"
                                          variant="contained"
                                          color="success"
                                          onClick={() => {
                                              addCategories(
                                                  id,
                                                  startCode,
                                                  endCode
                                              );
                                          }}>
                                          <CheckCircleOutlineOutlinedIcon />
                                      </Card>
                                  </div>
                                  <div>
                                      <Card
                                          className="flex p-1 bk-red hover-icon  coderange-title w-100"
                                          onClick={() => {
                                              setEdit(false);
                                              setstartCode(startRange);
                                              setendCode(endRange);
                                          }}>
                                          <CancelOutlinedIcon />
                                      </Card>
                                  </div>
                              </div>
                          </p>
                      </div>
                  )}
              </Card>
              {togleBar == "center" && !edit && (
                  <Card
                      className={`flex p-2 m-2 hover-icon bk-grey coderange-title ${
                          openDelete == id && "bk-dull"
                      }`}
                      // style={
                      //   openDelete == id
                      //     ? { background: "tranparent" }
                      //     : { background: "#4d4d4d" }
                      // }
                      onClick={() => {
                          openDelete !== id && setEdit(true);
                      }}>
                      <ModeEditTwoToneIcon
                          style={{ fill: "white" }}
                          className="w-100"
                      />
                  </Card>
              )}
              {togleBar == "center" && !edit && (
                  <Card
                      className={`flex p-2 m-2 hover-icon  bk-grey coderange-title ${
                          openDelete == id && "bk-dull"
                      }`}
                      onClick={() => {
                          setOpenDelete(id);
                      }}>
                      <DeleteForeverIcon
                          style={{ fill: "white" }}
                          className="w-100"
                      />
                  </Card>
              )}
              {togleBar == "center" && !edit && (
                  <Card
                      className={`flex p-2 m-2 hover-icon  bk-grey coderange-title ${
                          openDelete == id && "bk-dull"
                      }`}
                      onClick={() => {
                          resetCard(id);
                      }}>
                      <RestartAltIcon
                          style={{ fill: "white" }}
                          className="w-100"
                      />
                  </Card>
              )}
          </div>
          <div className="sep"></div>
          <div
              className={`d-flex ${
                  togleBar == "center" ? "scroll-card" : "main-card-scroll"
              }`}>
              {renderList.filteredList &&
              renderList.filteredList.length &&
              renderList.filteredList.length ? (
                  renderList.filteredList.map((d) => {
                      return (
                          <p
                              className={`m-2 w-100 invert font-row  ${
                                  togleBar !== "center" && "w-29 anti-invert"
                              }`}>
                              {d}
                          </p>
                      );
                  })
              ) : (
                  <p className="m-2 align-center w-100">
                      "NO Code In That Range"
                  </p>
              )}
          </div>
          <div className="sep"></div>
          <div className="p-1">
              <div className="total-wrap">
                  {" "}
                  <div className="span-wrap">
                      Total:{renderList.filteredList?.length}
                  </div>{" "}
                  <div className="total-span-wrapper">
                      <div className="span-wrap">
                          {renderList.total1?.toFixed(4)}
                      </div>
                      <div className="sep"></div>

                      <div className="span-wrap">
                          {renderList.total2?.toFixed(4)}
                      </div>
                  </div>
                  <div className="span-wrap"> 
                      {(renderList.total2?.toFixed(4)/renderList.total1?.toFixed(4)).toFixed(2)} %
                  </div>
              </div>
          </div>
          {children}
      </div>
  );
};

export default CategoriesCard;
