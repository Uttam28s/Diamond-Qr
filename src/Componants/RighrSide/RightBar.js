import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import { NotificationContainer } from "react-notifications";
import "react-notifications/lib/notifications.css";

const RightBar = ({ category, total }) => {
  return (
    <div className="right-bar-wrapper">
      <div className="top-bar-header">
        <NotificationContainer />
      </div>
      <Card className="card-wrapper m-1 p-1">
        <CardContent className="p-0">
          <div className="categories-wrapper">
            <CardContent className="table-container">
              <table className="w-100">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>KWeight</th>
                    <th>PWeight</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {(category.length &&
                    category.map((d, id) => (
                      <tr>
                        <td>{id + 1 || "-"}</td>
                        <td>{d.kWeight || "-"}</td>
                        <td>{d.pWeight || "-"}</td>
                        <td>{d.percentage || "-"}</td>
                      </tr>
                    ))) ||
                    ""}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Total</th>
                    <th>{total.kWeight || 0}</th>
                    <th>{total.pWeight || 0}</th>
                    <th>
                      {((total.pWeight / total.kWeight) * 100).toFixed(2) || 0}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RightBar;
