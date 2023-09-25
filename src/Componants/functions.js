export const randomcolor = () => {
    // var random =Math.floor(Math.random()*16777215).toString(16).padStart(6, '0').toUpperCase();
    let random = "";
    for (let i = 0; i < 3; i++)
      random += (
        "0" +
        Math.floor(((1 + Math.random()) * Math.pow(16, 2)) / 2).toString(16)
      ).slice(-2);
    var invert = (Number(`0x1${random}`) ^ 0xffffff)
      .toString(16)
      .substr(1)
      .toUpperCase();
    return { random: "#" + random, invert: "#" + invert };
  };


  export   const checkString = (input) => {
    let flag = true;
    let check = input.split(",");
    check.map((d) => {
      if (isNaN(d)) {
        flag = false;
      }
    });
    return flag;
  };


  export const  lastTwoNumber = (data)=>{
    
//return  data.split(",").slice(-2).map(Number)
  } 

  export const  lastOneNumber = (data)=>{
    
    return  (data).toString().split(",").slice(-1).map(Number)[0]
} 