import { Link } from "react-router";
import { designPath, useAppRoute } from "../lib/appRoute";

/** The way from Appearance to the Design page. */
export function DesignPageLink() {
  const { teamKey } = useAppRoute();
  return (
    <div className="design-page-link">
      <span>
        <strong>Design your own</strong>
        <span className="design-page-link-hint">
          Fonts, windows and cards, buttons, text fields and switches
        </span>
      </span>
      <Link className="design-page-link-cta" to={designPath(teamKey)}>
        Open Design page <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
