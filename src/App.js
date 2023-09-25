import React from "react";
import { HashRouter,  Route, Routes } from "react-router-dom";
import Index from "./Componants/Index";
import "antd/dist/antd.less";

function App() {
  return (
      <HashRouter>
        <Routes>
            <Route path={"/"} element={<Index />} />
        </Routes>
      </HashRouter>
  );
}

export default App;
