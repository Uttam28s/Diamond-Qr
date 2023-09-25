import React from "react";
import PropTypes from "prop-types";
import "./style.css";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FilterListOffIcon from "@mui/icons-material/FilterListOff";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";

const valueType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.number,
  PropTypes.bool,
]);

const propTypes = {
  labels: PropTypes.shape({
    left: {
      title: PropTypes.string.isRequired,
      value: valueType,
    },
    center: {
      title: PropTypes.string.isRequired,
      value: valueType,
    },
    right: {
      title: PropTypes.string.isRequired,
      value: valueType,
    },
  }),
  onChange: PropTypes.func.isRequired,
  styles: PropTypes.object,
};

const defaultProps = {
  labels: {
    left: {
      title: "left",
      value: "left",
    },
    center: {
      title: "center",
      value: "center",
    },
    right: {
      title: "right",
      value: "right",
    },
  }
};

class TripleToggleSwitch extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      switchPosition: props.position || "left",
      animation: null,
    };
  }

  getSwitchAnimation = (value) => {
    const { switchPosition } = this.state;
    let animation = null;
    if (value === "center" && switchPosition === "left") {
      animation = "left-to-center";
    } else if (value === "right" && switchPosition === "center") {
      animation = "center-to-right";
    } else if (value === "center" && switchPosition === "right") {
      animation = "right-to-center";
    } else if (value === "left" && switchPosition === "center") {
      animation = "center-to-left";
    } else if (value === "right" && switchPosition === "left") {
      animation = "left-to-right";
    } else if (value === "left" && switchPosition === "right") {
      animation = "right-to-left";
    }
    this.props.onChange(value);
    this.setState({ switchPosition: value, animation });
  };

  render() {
    const { labels } = this.props;

    return (
      <div className="main-container">
        <div
          className={`switch ${this.state.animation} ${this.state.switchPosition}-position`}
        ></div>
        <input
          defaultChecked
          onChange={(e) => this.getSwitchAnimation(e.target.value)}
          name="map-switch"
          id="left"
          type="radio"
          value="left"
        />
        <label
          className={`left-label ${
            this.state.switchPosition === "left" && "black-font"
          }`}
          htmlFor="left"
        >
          <h4>
            <FormatListBulletedIcon />
          </h4>
        </label>

        <input
          onChange={(e) => this.getSwitchAnimation(e.target.value)}
          name="map-switch"
          id="center"
          type="radio"
          value="center"
        />
        <label
          className={`center-label ${
            this.state.switchPosition === "center" && "black-font"
          }`}
          htmlFor="center"
        >
          <h4>
            <CategoryRoundedIcon />
          </h4>
        </label>

        <input
          onChange={(e) => this.getSwitchAnimation(e.target.value)}
          name="map-switch"
          id="right"
          type="radio"
          value="right"
        />
        <label
          className={`right-label ${
            this.state.switchPosition === "right" && "black-font"
          }`}
          htmlFor="right"
        >
          <h4>
            <FilterListOffIcon />
          </h4>
        </label>
      </div>
    );
  }
}

TripleToggleSwitch.propTypes = propTypes;
TripleToggleSwitch.defaultProps = defaultProps;

export default TripleToggleSwitch;
